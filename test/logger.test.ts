import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "../src/logger.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-logger-test");
const LOG_PATH = join(TMP_DIR, "test.log");

describe("Logger", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("writes JSON lines to log file", () => {
    const logger = new Logger(LOG_PATH);
    logger.logScan({
      event: "scan_complete",
      scan_id: "test-123",
      direction: "prompt",
      verdict: "allow",
      action_taken: "allowed",
      latency_ms: 150,
      detection_services_triggered: [],
      error: null,
    });

    const lines = readFileSync(LOG_PATH, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.event).toBe("scan_complete");
    expect(entry.scan_id).toBe("test-123");
    expect(entry.timestamp).toBeTruthy();
    expect(entry.content).toBeUndefined();
  });

  it("includes content when include_content is true", () => {
    const logger = new Logger(LOG_PATH, true);
    logger.logScan({
      event: "scan_complete",
      scan_id: "test-456",
      direction: "prompt",
      verdict: "allow",
      action_taken: "allowed",
      latency_ms: 100,
      detection_services_triggered: [],
      error: null,
      content: "sensitive prompt text",
    });

    const entry = JSON.parse(readFileSync(LOG_PATH, "utf-8").trim());
    expect(entry.content).toBe("sensitive prompt text");
  });

  it("strips content when include_content is false", () => {
    const logger = new Logger(LOG_PATH, false);
    logger.logScan({
      event: "scan_complete",
      scan_id: "test-789",
      direction: "response",
      verdict: "block",
      action_taken: "blocked",
      latency_ms: 200,
      detection_services_triggered: ["dlp"],
      error: null,
      content: "secret data",
    });

    const entry = JSON.parse(readFileSync(LOG_PATH, "utf-8").trim());
    expect(entry.content).toBeUndefined();
  });

  it("logs generic events", () => {
    const logger = new Logger(LOG_PATH);
    logger.logEvent("circuit_breaker_open", { failures: 5 });

    const entry = JSON.parse(readFileSync(LOG_PATH, "utf-8").trim());
    expect(entry.event).toBe("circuit_breaker_open");
    expect(entry.failures).toBe(5);
  });

  it("creates parent directories automatically", () => {
    const deepPath = join(TMP_DIR, "deep", "nested", "test.log");
    const logger = new Logger(deepPath);
    logger.logEvent("test");

    const content = readFileSync(deepPath, "utf-8");
    expect(content).toContain('"event":"test"');
  });
});
