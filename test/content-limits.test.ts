import { describe, it, expect } from "vitest";
import { applyContentLimits, DEFAULT_CONTENT_LIMITS } from "../src/content-limits.js";
import type { ContentLimitsConfig } from "../src/types.js";

describe("applyContentLimits", () => {
  const limits: ContentLimitsConfig = {
    max_scan_bytes: 100,
    truncate_bytes: 50,
  };

  it("passes through content under truncate threshold", () => {
    const result = applyContentLimits("hello", limits);
    expect(result).toEqual({ content: "hello", skipped: false });
  });

  it("skips content exceeding max_scan_bytes", () => {
    const big = "x".repeat(101);
    const result = applyContentLimits(big, limits);
    expect(result).toEqual({ content: "", skipped: true });
  });

  it("truncates content between truncate_bytes and max_scan_bytes", () => {
    const medium = "a".repeat(75);
    const result = applyContentLimits(medium, limits);
    expect(result.skipped).toBe(false);
    expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(50);
  });

  it("truncates at UTF-8 boundary without splitting multibyte chars", () => {
    // Each emoji is 4 bytes. 13 emojis = 52 bytes > truncate_bytes(50)
    const emojis = "\u{1F600}".repeat(13);
    const result = applyContentLimits(emojis, limits);
    expect(result.skipped).toBe(false);
    // Should truncate to 12 emojis (48 bytes) rather than splitting a char
    expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(50);
    // Verify no broken surrogate pairs
    expect(result.content).toBe("\u{1F600}".repeat(12));
  });

  it("handles empty string", () => {
    const result = applyContentLimits("", limits);
    expect(result).toEqual({ content: "", skipped: false });
  });

  it("exports sensible defaults", () => {
    expect(DEFAULT_CONTENT_LIMITS.max_scan_bytes).toBe(51200);
    expect(DEFAULT_CONTENT_LIMITS.truncate_bytes).toBe(20000);
  });
});
