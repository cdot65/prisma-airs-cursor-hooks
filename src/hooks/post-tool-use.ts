#!/usr/bin/env node
/**
 * Cursor hook: postToolUse (observe-only)
 *
 * Fires after any tool executes. Scans tool outputs for security violations.
 * Cannot block — observe-only. Logs violations for audit and emits warnings.
 * Routing lives in src/tool-routing.ts.
 *
 * Cursor contract:
 *   stdin  → JSON { tool_name, tool_input, tool_output, tool_use_id, ... }
 *   stdout → JSON {} (always allow)
 *   exit 0 always
 *   stderr → debug logs
 */
import { runHook, respond } from "./run-hook.js";
import { scanToolUse, isSkippedTool } from "../tool-routing.js";
import type { PostToolUseInput } from "../types.js";

function allowThrough(): void {
  respond({});
}

void runHook<PostToolUseInput>({
  allow: allowThrough,
  // Built-in read-only tools never scan — stay cheap and silent before config load
  skip: (input) => isSkippedTool(input.tool_name ?? "unknown"),
  handler: async (input, config, logger) => {
    const toolName = input.tool_name ?? "unknown";
    const result = await scanToolUse(config, logger, toolName, input.tool_input, input.tool_output);

    // postToolUse is observe-only — log violations, emit warning, never block
    if (result?.action === "block") {
      console.error(`[AIRS] postToolUse violation detected for tool=${toolName} (observe-only, cannot block).`);
    }

    allowThrough();
  },
});
