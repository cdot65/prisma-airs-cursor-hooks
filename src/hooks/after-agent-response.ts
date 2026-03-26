#!/usr/bin/env node
/**
 * Cursor hook: afterAgentResponse (observe-only)
 *
 * Fires AFTER the AI response is already displayed to the developer.
 * Cursor treats this as an observational hook — it cannot block or hide
 * the response. We scan for DLP / malicious content and **log** violations
 * for audit, but enforcement is best-effort: a userMessage warning is
 * emitted so Cursor may surface it in the Hooks output panel.
 *
 * Cursor contract:
 *   stdin  → JSON { text, conversation_id, model, user_email, ... }
 *   stdout → ignored by Cursor (we still emit JSON for logging consistency)
 *   exit 0 = success (exit 2 has no deny effect for this hook)
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import { scanResponse } from "../scanner.js";
import type { AfterAgentResponseInput, CursorHookOutput } from "../types.js";

/** Read all of stdin as a string */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Write a Cursor hook response to stdout */
function respond(output: CursorHookOutput): void {
  process.stdout.write(JSON.stringify(output) + "\n");
}

/** Allow the response through (fail-open default) */
function allowThrough(message?: string): void {
  const output: CursorHookOutput = { permission: "allow" };
  if (message) output.userMessage = message;
  respond(output);
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let input: AfterAgentResponseInput;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error("[AIRS] Failed to parse hook stdin as JSON, allowing through.");
    allowThrough();
    return;
  }

  // Expose Cursor-provided identity as env var for downstream use
  if (input.user_email) {
    process.env.CURSOR_USER_EMAIL = input.user_email;
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
  const result = await scanResponse(config, input.text, logger);

  if (result.action === "block") {
    // afterAgentResponse is observe-only — Cursor ignores deny/exit(2).
    // Log the violation and surface a warning; the response is already visible.
    console.error(`[AIRS] Response violation detected (observe-only, cannot block).`);
    allowThrough(
      result.message ?? "⚠ Prisma AIRS: this response was flagged but could not be blocked (afterAgentResponse is observe-only).",
    );
    return;
  }

  allowThrough(result.message);
}

main().catch((err) => {
  console.error(`[AIRS] Unhandled hook error: ${err}`);
  allowThrough();
});
