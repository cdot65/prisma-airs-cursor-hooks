#!/usr/bin/env node
/**
 * Cursor hook: beforeReadFile (can block, optional)
 *
 * Fires before the Agent reads a file into model context. Scans the file
 * contents via the prompt direction (DLP focus). Can deny the read to keep
 * secrets/PII out of model context.
 *
 * Cursor contract:
 *   stdin  → JSON { file_path, content, attachments?, ... }
 *   stdout → JSON { permission: "allow"|"deny", user_message? }
 *   exit 0 = success, exit 2 = deny
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { runHook, respond } from "./run-hook.js";
import { scanFileRead } from "../scanner.js";
import type { BeforeReadFileInput, BeforeReadFileOutput } from "../types.js";

function allowThrough(message?: string): void {
  const output: BeforeReadFileOutput = { permission: "allow" };
  if (message) output.user_message = message;
  respond(output);
}

void runHook<BeforeReadFileInput>({
  allow: allowThrough,
  configErrorMessage: "Prisma AIRS: configuration error — scan skipped (fail-open).",
  skip: (input) => !input.content?.trim(),
  handler: async (input, config, logger) => {
    // Empty-content and size-limit handling live in the scanner
    const result = await scanFileRead(
      config,
      input.content,
      input.file_path ?? "unknown",
      logger,
    );

    if (result.action === "block") {
      const output: BeforeReadFileOutput = {
        permission: "deny",
        user_message:
          result.message ?? `Prisma AIRS blocked reading ${input.file_path}.`,
      };
      respond(output);
      process.exit(2);
    }

    allowThrough(result.message);
  },
});
