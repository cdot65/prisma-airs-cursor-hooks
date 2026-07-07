import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../src/logger.js";
import type { AirsConfig } from "../src/types.js";

// Mock the airs-client module
vi.mock("../src/airs-client.js", () => ({
  executeScan: vi.fn(),
  resetInit: vi.fn(),
  AISecSDKException: class AISecSDKException extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AISecSDKException";
    }
  },
}));

import { scanPrompt, scanResponse, scanToolEvent } from "../src/scanner.js";
import { executeScan } from "../src/airs-client.js";

const mockConfig: AirsConfig = {
  endpoint: "https://test.api.prismacloud.io",
  apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
  profiles: { prompt: "test-prompt", response: "test-response", tool: "test-tool" },
  mode: "observe",
  timeout_ms: 3000,
  retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
  logging: { path: "/dev/null", include_content: false },
};

const allowScanResult = {
  action: "allow",
  scan_id: "scan-1",
  report_id: "report-1",
  category: "benign",
};

const blockScanResult = {
  action: "block",
  scan_id: "scan-2",
  report_id: "report-2",
  category: "malicious",
  prompt_detected: { injection: true },
};

describe("scanPrompt", () => {
  let logger: Logger;

  beforeEach(() => {
    process.env.PRISMA_AIRS_API_KEY = "test-key";
    logger = new Logger("/dev/null");
    vi.mocked(executeScan).mockReset();
  });

  afterEach(() => {
    delete process.env.PRISMA_AIRS_API_KEY;
  });

  it("passes through in observe mode even on block verdict", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: blockScanResult as any,
      latencyMs: 100,
    });

    const result = await scanPrompt(mockConfig, "test prompt", logger);
    expect(result.action).toBe("pass");
  });

  it("blocks in enforce mode with UX-friendly message", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: blockScanResult as any,
      latencyMs: 100,
    });

    const config = { ...mockConfig, mode: "enforce" as const };
    const result = await scanPrompt(config, "test prompt", logger);
    expect(result.action).toBe("block");
    // Verify message contains key UX elements
    expect(result.message).toContain("Prompt Blocked");
    expect(result.message).toContain("Prompt Injection");
    expect(result.message).toContain("What happened");
    expect(result.message).toContain("What to do");
    expect(result.message).toContain("Scan ID: scan-2");
    expect(result.message).toContain("false positive");
    expect(result.message).toContain("security team");
  });

  it("passes through in bypass mode without calling API", async () => {
    const config = { ...mockConfig, mode: "bypass" as const };
    const result = await scanPrompt(config, "test", logger);
    expect(result.action).toBe("pass");
    expect(executeScan).not.toHaveBeenCalled();
  });

  it("passes through on empty prompt", async () => {
    const result = await scanPrompt(mockConfig, "   ", logger);
    expect(result.action).toBe("pass");
    expect(executeScan).not.toHaveBeenCalled();
  });

  it("allows on allow verdict in enforce mode", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: allowScanResult as any,
      latencyMs: 50,
    });

    const config = { ...mockConfig, mode: "enforce" as const };
    const result = await scanPrompt(config, "benign prompt", logger);
    expect(result.action).toBe("pass");
  });

  it("fails open on SDK error", async () => {
    vi.mocked(executeScan).mockRejectedValue(new Error("network down"));

    const result = await scanPrompt(mockConfig, "test", logger);
    expect(result.action).toBe("pass");
  });

  it("skips oversized prompts per content limits (fail-open)", async () => {
    const config = { ...mockConfig, content_limits: { max_scan_bytes: 100, truncate_bytes: 50 } };
    const result = await scanPrompt(config, "x".repeat(200), logger);
    expect(result.action).toBe("pass");
    expect(executeScan).not.toHaveBeenCalled();
  });

  it("truncates prompts between truncate and max limits", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: allowScanResult as any,
      latencyMs: 10,
    });
    const config = { ...mockConfig, content_limits: { max_scan_bytes: 100, truncate_bytes: 50 } };
    await scanPrompt(config, "y".repeat(80), logger);
    expect(executeScan).toHaveBeenCalledWith(
      config,
      { direction: "prompt", prompt: "y".repeat(50) },
      expect.any(String),
      expect.any(Logger),
    );
  });

  it("blocks in enforce mode even when no detection services are parsed", async () => {
    // AIRS can return action=block with an empty/missing *_detected map
    // (e.g. tool_event scans). The block verdict must still be honored.
    vi.mocked(executeScan).mockResolvedValue({
      result: {
        action: "block",
        scan_id: "scan-nodetect",
        report_id: "report-nodetect",
        category: "malicious",
      } as any,
      latencyMs: 100,
    });

    const config = { ...mockConfig, mode: "enforce" as const };
    const result = await scanPrompt(config, "test prompt", logger);
    expect(result.action).toBe("block");
    expect(result.message).toContain("Security Policy");
  });
});

describe("scanResponse", () => {
  let logger: Logger;

  beforeEach(() => {
    process.env.PRISMA_AIRS_API_KEY = "test-key";
    logger = new Logger("/dev/null");
    vi.mocked(executeScan).mockReset();
  });

  afterEach(() => {
    delete process.env.PRISMA_AIRS_API_KEY;
  });

  it("extracts code and sends via SDK", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: allowScanResult as any,
      latencyMs: 100,
    });

    const response = "Here's code:\n\n```python\nprint('hello')\n```\n\nDone.";
    await scanResponse(mockConfig, response, logger);

    expect(executeScan).toHaveBeenCalledWith(
      mockConfig,
      {
        direction: "response",
        response: expect.stringContaining("Here's code:"),
        codeResponse: expect.stringContaining("print('hello')"),
      },
      expect.any(String),
      expect.any(Logger),
    );
  });

  it("sends only response field when no code found", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: allowScanResult as any,
      latencyMs: 50,
    });

    await scanResponse(mockConfig, "Just plain text response.", logger);

    expect(executeScan).toHaveBeenCalledWith(
      mockConfig,
      { direction: "response", response: "Just plain text response.", codeResponse: undefined },
      expect.any(String),
      expect.any(Logger),
    );
  });

  it("blocks response in enforce mode with UX-friendly message", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: {
        action: "block",
        scan_id: "scan-resp-1",
        report_id: "report-resp-1",
        category: "malicious",
        response_detected: { malicious_code: true },
      } as any,
      latencyMs: 100,
    });

    const config = { ...mockConfig, mode: "enforce" as const };
    const result = await scanResponse(
      config,
      "```python\nimport os; os.system('rm -rf /')\n```",
      logger,
    );
    expect(result.action).toBe("block");
    expect(result.message).toContain("Response Flagged");
    expect(result.message).toContain("observe-only");
    expect(result.message).toContain("Malicious Code");
    expect(result.message).toContain("What happened");
    expect(result.message).toContain("Scan ID: scan-resp-1");
  });

  it("passes through in bypass mode", async () => {
    const config = { ...mockConfig, mode: "bypass" as const };
    const result = await scanResponse(config, "test", logger);
    expect(result.action).toBe("pass");
    expect(executeScan).not.toHaveBeenCalled();
  });
});

describe("scanToolEvent", () => {
  let logger: Logger;

  beforeEach(() => {
    process.env.PRISMA_AIRS_API_KEY = "test-key";
    logger = new Logger("/dev/null");
    vi.mocked(executeScan).mockReset();
  });

  afterEach(() => {
    delete process.env.PRISMA_AIRS_API_KEY;
  });

  it("scans tool event and passes in observe mode", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: {
        action: "block",
        scan_id: "scan-tool-1",
        report_id: "report-tool-1",
        category: "malicious",
        prompt_detected: { injection: true },
      } as any,
      latencyMs: 100,
    });

    const result = await scanToolEvent(mockConfig, "MCP:github:get_file", '{"path":"x"}', undefined, logger);
    expect(result.action).toBe("pass");
  });

  it("blocks tool event in enforce mode", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: {
        action: "block",
        scan_id: "scan-tool-2",
        report_id: "report-tool-2",
        category: "malicious",
        prompt_detected: { injection: true },
      } as any,
      latencyMs: 100,
    });

    const config = { ...mockConfig, mode: "enforce" as const };
    const result = await scanToolEvent(config, "MCP:github:get_file", '{"path":"x"}', undefined, logger);
    expect(result.action).toBe("block");
    expect(result.message).toContain("MCP Tool Call");
    expect(result.message).toContain("Prompt Injection");
  });

  it("passes in bypass mode without calling API", async () => {
    const config = { ...mockConfig, mode: "bypass" as const };
    const result = await scanToolEvent(config, "MCP:s:t", "input", undefined, logger);
    expect(result.action).toBe("pass");
    expect(executeScan).not.toHaveBeenCalled();
  });

  it("scans output alone when input exceeds content limits", async () => {
    vi.mocked(executeScan).mockResolvedValue({
      result: { action: "allow", scan_id: "s", report_id: "r", category: "benign" } as any,
      latencyMs: 10,
    });
    const config = { ...mockConfig, content_limits: { max_scan_bytes: 100, truncate_bytes: 50 } };
    await scanToolEvent(config, "MCP:s:t", "x".repeat(200), "small output", logger);
    expect(executeScan).toHaveBeenCalledWith(
      config,
      { direction: "tool", serverName: "s", toolInvoked: "t", input: undefined, output: "small output" },
      expect.any(String),
      expect.any(Logger),
    );
  });

  it("skips entirely when both input and output exceed limits", async () => {
    const config = { ...mockConfig, content_limits: { max_scan_bytes: 100, truncate_bytes: 50 } };
    const result = await scanToolEvent(config, "MCP:s:t", "x".repeat(200), "y".repeat(200), logger);
    expect(result.action).toBe("pass");
    expect(executeScan).not.toHaveBeenCalled();
  });

  it("fails open on SDK error", async () => {
    vi.mocked(executeScan).mockRejectedValue(new Error("network down"));
    const result = await scanToolEvent(mockConfig, "MCP:s:t", "input", undefined, logger);
    expect(result.action).toBe("pass");
  });
});
