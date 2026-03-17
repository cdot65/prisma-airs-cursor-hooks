import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../src/logger.js";
import type { AirsConfig } from "../src/types.js";

// Mock the airs-client module
vi.mock("../src/airs-client.js", () => ({
  scanPromptContent: vi.fn(),
  scanResponseContent: vi.fn(),
  resetInit: vi.fn(),
  AISecSDKException: class AISecSDKException extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AISecSDKException";
    }
  },
}));

import { scanPrompt, scanResponse } from "../src/scanner.js";
import { scanPromptContent, scanResponseContent } from "../src/airs-client.js";

const mockConfig: AirsConfig = {
  endpoint: "https://test.api.prismacloud.io",
  apiKeyEnvVar: "AIRS_API_KEY",
  profiles: { prompt: "test-prompt", response: "test-response" },
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
    process.env.AIRS_API_KEY = "test-key";
    logger = new Logger("/dev/null");
    vi.mocked(scanPromptContent).mockReset();
    vi.mocked(scanResponseContent).mockReset();
  });

  afterEach(() => {
    delete process.env.AIRS_API_KEY;
  });

  it("passes through in observe mode even on block verdict", async () => {
    vi.mocked(scanPromptContent).mockResolvedValue({
      result: blockScanResult as any,
      latencyMs: 100,
    });

    const result = await scanPrompt(mockConfig, "test prompt", logger);
    expect(result.action).toBe("pass");
  });

  it("blocks in enforce mode with UX-friendly message", async () => {
    vi.mocked(scanPromptContent).mockResolvedValue({
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
    expect(scanPromptContent).not.toHaveBeenCalled();
  });

  it("passes through on empty prompt", async () => {
    const result = await scanPrompt(mockConfig, "   ", logger);
    expect(result.action).toBe("pass");
    expect(scanPromptContent).not.toHaveBeenCalled();
  });

  it("allows on allow verdict in enforce mode", async () => {
    vi.mocked(scanPromptContent).mockResolvedValue({
      result: allowScanResult as any,
      latencyMs: 50,
    });

    const config = { ...mockConfig, mode: "enforce" as const };
    const result = await scanPrompt(config, "benign prompt", logger);
    expect(result.action).toBe("pass");
  });

  it("fails open on SDK error", async () => {
    vi.mocked(scanPromptContent).mockRejectedValue(new Error("network down"));

    const result = await scanPrompt(mockConfig, "test", logger);
    expect(result.action).toBe("pass");
  });
});

describe("scanResponse", () => {
  let logger: Logger;

  beforeEach(() => {
    process.env.AIRS_API_KEY = "test-key";
    logger = new Logger("/dev/null");
    vi.mocked(scanPromptContent).mockReset();
    vi.mocked(scanResponseContent).mockReset();
  });

  afterEach(() => {
    delete process.env.AIRS_API_KEY;
  });

  it("extracts code and sends via SDK", async () => {
    vi.mocked(scanResponseContent).mockResolvedValue({
      result: allowScanResult as any,
      latencyMs: 100,
    });

    const response = "Here's code:\n\n```python\nprint('hello')\n```\n\nDone.";
    await scanResponse(mockConfig, response, logger);

    expect(scanResponseContent).toHaveBeenCalledWith(
      mockConfig,
      expect.stringContaining("Here's code:"),
      expect.stringContaining("print('hello')"),
      expect.any(String),
      expect.any(Logger),
    );
  });

  it("sends only response field when no code found", async () => {
    vi.mocked(scanResponseContent).mockResolvedValue({
      result: allowScanResult as any,
      latencyMs: 50,
    });

    await scanResponse(mockConfig, "Just plain text response.", logger);

    expect(scanResponseContent).toHaveBeenCalledWith(
      mockConfig,
      "Just plain text response.",
      undefined,
      expect.any(String),
      expect.any(Logger),
    );
  });

  it("blocks response in enforce mode with UX-friendly message", async () => {
    vi.mocked(scanResponseContent).mockResolvedValue({
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
    expect(result.message).toContain("Response Blocked");
    expect(result.message).toContain("Malicious Code");
    expect(result.message).toContain("What happened");
    expect(result.message).toContain("What to do");
    expect(result.message).toContain("Scan ID: scan-resp-1");
  });

  it("passes through in bypass mode", async () => {
    const config = { ...mockConfig, mode: "bypass" as const };
    const result = await scanResponse(config, "test", logger);
    expect(result.action).toBe("pass");
    expect(scanResponseContent).not.toHaveBeenCalled();
  });
});
