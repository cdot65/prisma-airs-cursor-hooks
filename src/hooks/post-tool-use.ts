#!/usr/bin/env node
/**
 * Cursor hook: postToolUse (observe-only)
 *
 * Fires after any tool executes. Scans tool outputs for security violations.
 * Cannot block — observe-only. Logs violations for audit and emits warnings.
 *
 * Routing:
 *   MCP:*  → scan input + output as tool_event
 *   Bash   → scan output as response
 *   Write  → scan content for DLP via prompt
 *   Edit   → scan new_string for DLP via prompt
 *   Others → skip (Grep, Read, Glob, Delete, Task, NotebookEdit)
 *
 * Cursor contract:
 *   stdin  → JSON { tool_name, tool_input, tool_output, tool_use_id, ... }
 *   stdout → JSON {} (always allow)
 *   exit 0 always
 *   stderr → debug logs
 */
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import { scanToolEvent, scanResponse, scanPrompt } from "../scanner.js";
import { applyContentLimits, DEFAULT_CONTENT_LIMITS } from "../content-limits.js";
import type { PostToolUseInput } from "../types.js";

const SKIP_TOOLS = new Set(["Grep", "Read", "Glob", "Delete", "Task", "NotebookEdit"]);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function respond(): void {
  process.stdout.write("{}\n");
}

/** Normalize unknown value to a string */
function normalize(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw === null || raw === undefined) return "";
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let input: PostToolUseInput;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error("[AIRS] Failed to parse hook stdin as JSON.");
    respond();
    return;
  }

  if (input.user_email) {
    process.env.CURSOR_USER_EMAIL = input.user_email;
  }

  const toolName = input.tool_name ?? "unknown";

  // Skip Cursor built-in tools that operate on local files
  if (SKIP_TOOLS.has(toolName)) {
    respond();
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[AIRS] Config error: ${err}`);
    respond();
    return;
  }

  const logger = new Logger(config.logging.path, config.logging.include_content);
  const limits = config.content_limits ?? DEFAULT_CONTENT_LIMITS;

  let result;

  if (toolName === "Write") {
    // Scan file content for DLP
    const content = normalize((input.tool_input as Record<string, unknown>)?.content);
    if (!content.trim()) { respond(); return; }
    const limited = applyContentLimits(content, limits);
    if (limited.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      respond();
      return;
    }
    result = await scanPrompt(config, limited.content, logger);
  } else if (toolName === "Edit") {
    // Scan new_string for DLP
    const newString = normalize((input.tool_input as Record<string, unknown>)?.new_string);
    if (!newString.trim()) { respond(); return; }
    const limited = applyContentLimits(newString, limits);
    if (limited.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      respond();
      return;
    }
    result = await scanPrompt(config, limited.content, logger);
  } else if (toolName.startsWith("MCP:")) {
    // Scan as tool_event (structured input + output)
    const toolInput = normalize(input.tool_input);
    const toolOutput = normalize(input.tool_output);
    if (!toolInput.trim() && !toolOutput.trim()) { respond(); return; }
    const limitedInput = applyContentLimits(toolInput, limits);
    const limitedOutput = applyContentLimits(toolOutput, limits);
    if (limitedInput.skipped && limitedOutput.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      respond();
      return;
    }
    result = await scanToolEvent(
      config, toolName,
      limitedInput.skipped ? undefined : limitedInput.content,
      limitedOutput.skipped ? undefined : limitedOutput.content,
      logger,
    );
  } else {
    // Shell / Bash — scan output as response
    const toolOutput = normalize(input.tool_output);
    if (!toolOutput.trim()) { respond(); return; }
    const limited = applyContentLimits(toolOutput, limits);
    if (limited.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      respond();
      return;
    }
    result = await scanResponse(config, limited.content, logger);
  }

  // postToolUse is observe-only — log violations, emit warning, never block
  if (result.action === "block") {
    console.error(`[AIRS] postToolUse violation detected for tool=${toolName} (observe-only, cannot block).`);
  }

  respond();
}

main().catch((err) => {
  console.error(`[AIRS] Unhandled hook error: ${err}`);
  respond();
});
