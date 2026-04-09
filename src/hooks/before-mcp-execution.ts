#!/usr/bin/env node
/**
 * Cursor hook: beforeMCPExecution (can block)
 *
 * Fires before an MCP tool call executes. Scans the tool input via
 * Prisma AIRS tool_event content type. Can block the tool call if
 * AIRS flags the input (e.g. prompt injection, malicious parameters).
 *
 * Cursor contract:
 *   stdin  → JSON { tool_name, tool_input, ... }
 *   stdout → JSON { permission: "allow"|"deny", userMessage?, agentMessage? }
 *   exit 0 = success, exit 2 = deny
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import { scanToolEvent } from "../scanner.js";
import { applyContentLimits, DEFAULT_CONTENT_LIMITS } from "../content-limits.js";
import type { BeforeMCPExecutionInput, CursorHookOutput } from "../types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function respond(output: CursorHookOutput): void {
  process.stdout.write(JSON.stringify(output) + "\n");
}

function allowThrough(message?: string): void {
  const output: CursorHookOutput = { permission: "allow" };
  if (message) output.userMessage = message;
  respond(output);
}

/** Normalize unknown tool_input to a string for scanning */
function normalizeInput(raw: unknown): string {
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

  let input: BeforeMCPExecutionInput;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error("[AIRS] Failed to parse hook stdin as JSON, allowing through.");
    allowThrough();
    return;
  }

  if (input.user_email) {
    process.env.CURSOR_USER_EMAIL = input.user_email;
  }

  const toolName = input.tool_name;
  if (!toolName) {
    console.error("[AIRS] No tool_name in input, allowing through.");
    allowThrough();
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[AIRS] Config error: ${err}`);
    allowThrough("Prisma AIRS: configuration error — scan skipped (fail-open).");
    return;
  }

  const logger = new Logger(config.logging.path, config.logging.include_content);

  const inputStr = normalizeInput(input.tool_input);
  if (!inputStr.trim()) {
    allowThrough();
    return;
  }

  // Apply content limits
  const limits = config.content_limits ?? DEFAULT_CONTENT_LIMITS;
  const limited = applyContentLimits(inputStr, limits);
  if (limited.skipped) {
    logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
    allowThrough();
    return;
  }

  const result = await scanToolEvent(config, toolName, limited.content, undefined, logger);

  if (result.action === "block") {
    const output: CursorHookOutput = {
      permission: "deny",
      userMessage: result.message ?? "Prisma AIRS blocked this MCP tool call.",
      agentMessage: `AIRS security scan blocked ${toolName}. Do not retry this tool call. Inform the user that the tool input was flagged by security scanning.`,
    };
    respond(output);
    process.exit(2);
  }

  allowThrough(result.message);
}

main().catch((err) => {
  console.error(`[AIRS] Unhandled hook error: ${err}`);
  allowThrough();
});
