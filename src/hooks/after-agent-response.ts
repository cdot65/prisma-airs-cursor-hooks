#!/usr/bin/env node
/**
 * Cursor hook: afterAgentResponse
 *
 * Intercepts the AI agent's response before it is displayed to the developer.
 * Extracts code blocks for dedicated malicious code scanning via code_response.
 *
 * Cursor contract:
 *   stdin  → JSON { response, conversation_id, model, user_email, ... }
 *   stdout → JSON { permission: "allow"|"deny", userMessage?, agentMessage? }
 *   exit 0 = success, exit 2 = deny
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
    const output: CursorHookOutput = {
      permission: "deny",
      userMessage: result.message ?? "Prisma AIRS blocked this response.",
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
