#!/usr/bin/env node
/**
 * Cursor hook: afterMCPExecution (observe-only, optional)
 *
 * Fires after an MCP tool executes. Scans the tool input and full result
 * JSON as a tool_event. Cannot block — the tool already ran. Logs
 * violations for audit and emits warnings.
 *
 * If postToolUse is also installed, MCP results are scanned twice —
 * prefer one or the other for MCP auditing.
 *
 * Cursor contract:
 *   stdin  → JSON { tool_name, tool_input, result_json, duration, ... }
 *   stdout → JSON {} (ignored by Cursor)
 *   exit 0 always
 *   stderr → debug logs
 */
import { runHook, respond } from "./run-hook.js";
import { scanToolEvent } from "../scanner.js";
import { normalize } from "../tool-routing.js";
import type { AfterMCPExecutionInput } from "../types.js";

function allowThrough(): void {
  respond({});
}

void runHook<AfterMCPExecutionInput>({
  allow: allowThrough,
  skip: (input) => {
    if (!input.tool_name) {
      console.error("[AIRS] No tool_name in input, allowing through.");
      return true;
    }
    return false;
  },
  handler: async (input, config, logger) => {
    // Empty-content and size-limit handling live in the scanner
    const result = await scanToolEvent(
      config,
      input.tool_name,
      normalize(input.tool_input),
      normalize(input.result_json),
      logger,
    );

    // afterMCPExecution is observe-only — log violations, never block
    if (result.action === "block") {
      console.error(
        `[AIRS] afterMCPExecution violation detected for tool=${input.tool_name} (observe-only, cannot block).`,
      );
    }

    allowThrough();
  },
});
