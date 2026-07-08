/**
 * postToolUse routing: decide how (or whether) to scan a tool's input/output.
 *
 * Routing:
 *   MCP:*  → scan input + output as tool_event
 *   Bash   → scan output as response
 *   Write  → scan content for DLP via prompt
 *   Edit   → scan new_string for DLP via prompt
 *   Others → skip (Grep, Read, Glob, Delete, Task, NotebookEdit)
 *
 * Size limits and empty-content checks are owned by the scanner.
 */
import type { AirsConfig, HookResult } from "./types.js";
import { Logger } from "./logger.js";
import { scanPrompt, scanResponse, scanToolEvent } from "./scanner.js";

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

/**
 * Scan a completed tool use. Returns the scan's HookResult,
 * or null when the tool is in the skip list.
 */
export async function scanToolUse(
  config: AirsConfig,
  logger: Logger,
  toolName: string,
  toolInput: unknown,
  toolOutput: unknown,
): Promise<HookResult | null> {
  if (isSkippedTool(toolName)) return null;

  if (toolName === "Write" || toolName === "Edit") {
    // Scan authored file content for DLP
    const field = toolName === "Write" ? "content" : "new_string";
    const content = normalize((toolInput as Record<string, unknown>)?.[field]);
    return scanPrompt(config, content, logger);
  }

  if (toolName.startsWith("MCP:")) {
    // Scan as tool_event (structured input + output)
    return scanToolEvent(config, toolName, normalize(toolInput), normalize(toolOutput), logger);
  }

  // Shell / Bash — scan output as response
  return scanResponse(config, normalize(toolOutput), logger);
}
