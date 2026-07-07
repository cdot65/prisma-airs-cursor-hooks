/**
 * postToolUse routing: decide how (or whether) to scan a tool's input/output.
 *
 * Routing:
 *   MCP:*  → scan input + output as tool_event
 *   Bash   → scan output as response
 *   Write  → scan content for DLP via prompt
 *   Edit   → scan new_string for DLP via prompt
 *   Others → skip (Grep, Read, Glob, Delete, Task, NotebookEdit)
 */
import type { AirsConfig, HookResult } from "./types.js";
import { Logger } from "./logger.js";
import { scanPrompt, scanResponse, scanToolEvent } from "./scanner.js";
import { applyContentLimits, DEFAULT_CONTENT_LIMITS } from "./content-limits.js";
import type { ContentLimitsConfig } from "./types.js";

const SKIP_TOOLS = new Set(["Grep", "Read", "Glob", "Delete", "Task", "NotebookEdit"]);

/** Built-in read-only tools that are never scanned */
export function isSkippedTool(toolName: string): boolean {
  return SKIP_TOOLS.has(toolName);
}

/** Normalize an unknown tool payload to a scannable string */
export function normalize(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw === null || raw === undefined) return "";
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

/** Apply content limits; returns null (and logs) when the content must be skipped */
function limit(
  content: string,
  limits: ContentLimitsConfig,
  logger: Logger,
  toolName: string,
): string | null {
  const limited = applyContentLimits(content, limits);
  if (limited.skipped) {
    logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
    return null;
  }
  return limited.content;
}

/**
 * Scan a completed tool use. Returns the scan's HookResult, or null when the
 * tool is skipped, the content is empty, or size limits rule the scan out.
 */
export async function scanToolUse(
  config: AirsConfig,
  logger: Logger,
  toolName: string,
  toolInput: unknown,
  toolOutput: unknown,
): Promise<HookResult | null> {
  if (SKIP_TOOLS.has(toolName)) return null;

  const limits = config.content_limits ?? DEFAULT_CONTENT_LIMITS;

  if (toolName === "Write" || toolName === "Edit") {
    // Scan authored file content for DLP
    const field = toolName === "Write" ? "content" : "new_string";
    const content = normalize((toolInput as Record<string, unknown>)?.[field]);
    if (!content.trim()) return null;
    const limited = limit(content, limits, logger, toolName);
    if (limited === null) return null;
    return scanPrompt(config, limited, logger);
  }

  if (toolName.startsWith("MCP:")) {
    // Scan as tool_event (structured input + output)
    const inputStr = normalize(toolInput);
    const outputStr = normalize(toolOutput);
    if (!inputStr.trim() && !outputStr.trim()) return null;
    const limitedInput = applyContentLimits(inputStr, limits);
    const limitedOutput = applyContentLimits(outputStr, limits);
    if (limitedInput.skipped && limitedOutput.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      return null;
    }
    return scanToolEvent(
      config,
      toolName,
      limitedInput.skipped ? undefined : limitedInput.content,
      limitedOutput.skipped ? undefined : limitedOutput.content,
      logger,
    );
  }

  // Shell / Bash — scan output as response
  const outputStr = normalize(toolOutput);
  if (!outputStr.trim()) return null;
  const limited = limit(outputStr, limits, logger, toolName);
  if (limited === null) return null;
  return scanResponse(config, limited, logger);
}
