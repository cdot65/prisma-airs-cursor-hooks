#!/usr/bin/env node
/**
 * Cursor hook: afterShellExecution (observe-only, optional)
 *
 * Fires after a shell command executes. Scans the terminal output as a
 * response (DLP: leaked credentials, env dumps). Cannot block — the
 * command already ran. Logs violations for audit and emits warnings.
 *
 * Cursor contract:
 *   stdin  → JSON { command, output, duration, sandbox, ... }
 *   stdout → JSON {} (ignored by Cursor)
 *   exit 0 always
 *   stderr → debug logs
 */
import { runHook, respond } from "./run-hook.js";
import { scanResponse } from "../scanner.js";
import type { AfterShellExecutionInput } from "../types.js";

function allowThrough(): void {
  respond({});
}

void runHook<AfterShellExecutionInput>({
  allow: allowThrough,
  skip: (input) => !input.output?.trim(),
  handler: async (input, config, logger) => {
    const result = await scanResponse(config, input.output, logger);

    // afterShellExecution is observe-only — log violations, never block
    if (result.action === "block") {
      console.error(
        "[AIRS] afterShellExecution violation detected in shell output (observe-only, cannot block).",
      );
    }

    allowThrough();
  },
});
