import type { ContentLimitsConfig } from "./types.js";

export const DEFAULT_CONTENT_LIMITS: ContentLimitsConfig = {
  max_scan_bytes: 51200,
  truncate_bytes: 20000,
};

export interface ContentLimitResult {
  content: string;
  skipped: boolean;
}

/**
 * Apply size limits to content before scanning.
 * - Above max_scan_bytes: skip entirely
 * - Above truncate_bytes: truncate at UTF-8 boundary
 * - Otherwise: pass through
 */
export function applyContentLimits(
  content: string,
  limits: ContentLimitsConfig,
): ContentLimitResult {
  const byteLength = Buffer.byteLength(content);

  if (byteLength > limits.max_scan_bytes) {
    return { content: "", skipped: true };
  }

  if (byteLength > limits.truncate_bytes) {
    const buf = Buffer.from(content);
    // Find the last complete UTF-8 character at or before truncate_bytes
    let end = limits.truncate_bytes;
    // Walk back if we're in the middle of a multibyte character
    while (end > 0 && (buf[end] & 0xc0) === 0x80) {
      end--;
    }
    return { content: buf.slice(0, end).toString("utf-8"), skipped: false };
  }

  return { content, skipped: false };
}
