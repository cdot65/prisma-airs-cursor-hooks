#!/usr/bin/env node
/**
 * Cursor hook: beforeShellExecution (can block, optional)
 *
 * Fires before any shell command executes. Scans the command text via
 * Prisma AIRS tool_event content type. Can block the command if AIRS
 * flags it (e.g. malicious code, exfiltration patterns).
 *
 * Cursor contract:
 *   stdin  → JSON { command, cwd, sandbox, ... }
 *   stdout → JSON { permission: "allow"|"deny", userMessage?, agentMessage? }
 *   exit 0 = success, exit 2 = deny
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { runHook, respond } from "./run-hook.js";
import { scanShellCommand } from "../scanner.js";
import type { BeforeShellExecutionInput, CursorHookOutput } from "../types.js";

function allowThrough(message?: string): void {
  const output: CursorHookOutput = { permission: "allow" };
  if (message) output.userMessage = message;
  respond(output);
}

void runHook<BeforeShellExecutionInput>({
  allow: allowThrough,
  configErrorMessage: "Prisma AIRS: configuration error — scan skipped (fail-open).",
  skip: (input) => !input.command?.trim(),
  handler: async (input, config, logger) => {
    // Empty-content and size-limit handling live in the scanner
    const result = await scanShellCommand(config, input.command, logger);

    if (result.action === "block") {
      const output: CursorHookOutput = {
        permission: "deny",
        userMessage: result.message ?? "Prisma AIRS blocked this shell command.",
        agentMessage:
          "AIRS security scan blocked this shell command. Do not retry it. Inform the user that the command was flagged by security scanning.",
      };
      respond(output);
      process.exit(2);
    }

    allowThrough(result.message);
  },
});
