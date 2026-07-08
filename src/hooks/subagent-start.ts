#!/usr/bin/env node
/**
 * Cursor hook: subagentStart (can block, optional)
 *
 * Fires before a subagent (Task tool) spawns. The task description is a
 * prompt-injection surface — scan it via the prompt direction and deny the
 * spawn when AIRS flags it in enforce mode.
 *
 * Cursor contract:
 *   stdin  → JSON { subagent_id, subagent_type, task, ... }
 *   stdout → JSON { permission: "allow"|"deny", user_message? }
 *            ("ask" is treated as deny by Cursor — never emitted)
 *   exit 0 = success, exit 2 = deny
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { runHook, respond } from "./run-hook.js";
import { scanSubagentTask } from "../scanner.js";
import type { SubagentStartInput, SubagentStartOutput } from "../types.js";

function allowThrough(message?: string): void {
  const output: SubagentStartOutput = { permission: "allow" };
  if (message) output.user_message = message;
  respond(output);
}

void runHook<SubagentStartInput>({
  allow: allowThrough,
  configErrorMessage: "Prisma AIRS: configuration error — scan skipped (fail-open).",
  skip: (input) => !input.task?.trim(),
  handler: async (input, config, logger) => {
    const result = await scanSubagentTask(
      config,
      input.task,
      input.subagent_type ?? "unknown",
      logger,
    );

    if (result.action === "block") {
      const output: SubagentStartOutput = {
        permission: "deny",
        user_message:
          result.message ?? "Prisma AIRS blocked this subagent task.",
      };
      respond(output);
      process.exit(2);
    }

    allowThrough(result.message);
  },
});
