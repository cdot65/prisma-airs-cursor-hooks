#!/usr/bin/env node
/**
 * Cursor hook: beforeSubmitPrompt
 *
 * Intercepts the developer's prompt before it is sent to the AI model.
 * Reads structured JSON from stdin, scans the prompt via Prisma AIRS,
 * and writes a JSON response to stdout telling Cursor to allow or deny.
 *
 * Cursor contract:
 *   stdin  → JSON { prompt, conversation_id, model, user_email, ... }
 *   stdout → JSON { permission: "allow"|"deny", userMessage?, agentMessage? }
 *   exit 0 = success, exit 2 = deny
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import { scanPrompt } from "../scanner.js";
import type { BeforeSubmitPromptInput, BeforeSubmitPromptOutput } from "../types.js";

/** Read all of stdin as a string */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Write a beforeSubmitPrompt response to stdout */
function respond(output: BeforeSubmitPromptOutput): void {
  process.stdout.write(JSON.stringify(output) + "\n");
}

/** Allow the prompt through (fail-open default) */
function allowThrough(): void {
  respond({ continue: true });
}

/** Block the prompt */
function blockPrompt(message: string): void {
  respond({ continue: false, user_message: message });
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let input: BeforeSubmitPromptInput;
  try {
    input = JSON.parse(raw);
  } catch {
    // stdin wasn't valid JSON — fail-open
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
    allowThrough();
    return;
  }

  const logger = new Logger(config.logging.path, config.logging.include_content);
  const result = await scanPrompt(config, input.prompt, logger);

  if (result.action === "block") {
    blockPrompt(result.message ?? "Prisma AIRS blocked this prompt.");
    return;
  }

  allowThrough();
}

main().catch((err) => {
  // Fail-open: never block the developer on unhandled errors
  console.error(`[AIRS] Unhandled hook error: ${err}`);
  allowThrough();
});
