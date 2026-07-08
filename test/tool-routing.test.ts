import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "../src/logger.js";
import type { AirsConfig } from "../src/types.js";

vi.mock("../src/scanner.js", () => ({
  scanPrompt: vi.fn(),
  scanResponse: vi.fn(),
  scanToolEvent: vi.fn(),
}));

import { scanToolUse, normalize } from "../src/tool-routing.js";
import { scanPrompt, scanResponse, scanToolEvent } from "../src/scanner.js";

const config: AirsConfig = {
  endpoint: "https://test.api",
  apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
  profiles: { prompt: "p", response: "r", tool: "t" },
  mode: "observe",
  timeout_ms: 3000,
  retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
  logging: { path: "/dev/null", include_content: false },
  content_limits: { max_scan_bytes: 100, truncate_bytes: 50 },
};

const logger = new Logger("/dev/null");
const PASS = { action: "pass" as const };

describe("scanToolUse routing", () => {
  beforeEach(() => {
    vi.mocked(scanPrompt).mockReset().mockResolvedValue(PASS);
    vi.mocked(scanResponse).mockReset().mockResolvedValue(PASS);
    vi.mocked(scanToolEvent).mockReset().mockResolvedValue(PASS);
  });

  it("skips built-in read-only tools", async () => {
    for (const tool of ["Grep", "Read", "Glob", "Delete", "Task", "NotebookEdit"]) {
      expect(await scanToolUse(config, logger, tool, {}, "output")).toBeNull();
    }
    expect(scanPrompt).not.toHaveBeenCalled();
    expect(scanResponse).not.toHaveBeenCalled();
    expect(scanToolEvent).not.toHaveBeenCalled();
  });

  it("routes Write content to prompt scan (DLP)", async () => {
    await scanToolUse(config, logger, "Write", { content: "file body" }, undefined);
    expect(scanPrompt).toHaveBeenCalledWith(config, "file body", logger);
  });

  it("routes Edit new_string to prompt scan (DLP)", async () => {
    await scanToolUse(config, logger, "Edit", { new_string: "edited" }, undefined);
    expect(scanPrompt).toHaveBeenCalledWith(config, "edited", logger);
  });

  it("delegates empty Write content to the scanner (which passes without scanning)", async () => {
    const result = await scanToolUse(config, logger, "Write", { content: "  " }, undefined);
    expect(scanPrompt).toHaveBeenCalledWith(config, "  ", logger);
    expect(result).toEqual(PASS);
  });

  it("routes MCP tools to tool_event scan with input and output", async () => {
    await scanToolUse(config, logger, "MCP:github:get_file", { q: "x" }, "result");
    expect(scanToolEvent).toHaveBeenCalledWith(
      config, "MCP:github:get_file", '{"q":"x"}', "result", logger,
    );
  });

  it("routes Bash output to response scan", async () => {
    await scanToolUse(config, logger, "Bash", { cmd: "ls" }, "listing");
    expect(scanResponse).toHaveBeenCalledWith(config, "listing", logger);
  });

  it("propagates a block result from the scanner", async () => {
    vi.mocked(scanResponse).mockResolvedValue({ action: "block", message: "flagged" });
    const result = await scanToolUse(config, logger, "Bash", {}, "bad output");
    expect(result).toEqual({ action: "block", message: "flagged" });
  });

});

describe("normalize", () => {
  it("passes strings through", () => {
    expect(normalize("abc")).toBe("abc");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });

  it("stringifies objects", () => {
    expect(normalize({ a: 1 })).toBe('{"a":1}');
  });

  it("falls back to String() for non-serializable values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(normalize(circular)).toBe("[object Object]");
  });
});
