#!/usr/bin/env node
/**
 * Cursor hook: beforeTabFileRead (can block, optional)
 *
 * Fires before Tab (inline completions) reads a file. Scans the file
 * contents via the prompt direction (DLP focus). Can deny to keep
 * secrets/PII away from Tab completions.
 *
 * Tab fires frequently — each scan adds latency, which is why this hook
 * ships as optional. Empty files skip before config load.
 *
 * Cursor contract:
 *   stdin  → JSON { file_path, content, ... }
 *   stdout → JSON { permission: "allow"|"deny" }  (no message channel)
 *   exit 0 = success, exit 2 = deny
 *   stderr → debug logs
 */
import { runHook, respond } from "./run-hook.js";
import { scanFileRead } from "../scanner.js";
import type { BeforeTabFileReadInput, BeforeTabFileReadOutput } from "../types.js";

function allowThrough(): void {
  const output: BeforeTabFileReadOutput = { permission: "allow" };
  respond(output);
}

void runHook<BeforeTabFileReadInput>({
  allow: allowThrough,
  skip: (input) => !input.content?.trim(),
  handler: async (input, config, logger) => {
    const result = await scanFileRead(
      config,
      input.content,
      input.file_path ?? "unknown",
      logger,
    );

    if (result.action === "block") {
      const output: BeforeTabFileReadOutput = { permission: "deny" };
      respond(output);
      process.exit(2);
    }

    allowThrough();
  },
});
