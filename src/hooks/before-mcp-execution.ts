#!/usr/bin/env node
/**
 * Cursor hook: beforeMCPExecution (can block)
 *
 * Fires before an MCP tool call executes. Scans the tool input via
 * Prisma AIRS tool_event content type. Can block the tool call if
 * AIRS flags the input (e.g. prompt injection, malicious parameters).
 *
 * Cursor contract:
 *   stdin  → JSON { tool_name, tool_input, ... }
 *   stdout → JSON { permission: "allow"|"deny", userMessage?, agentMessage? }
 *   exit 0 = success, exit 2 = deny
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { runHook, respond } from "./run-hook.js";
import { scanToolEvent } from "../scanner.js";
import { normalize } from "../tool-routing.js";
import type { BeforeMCPExecutionInput, CursorHookOutput } from "../types.js";

function allowThrough(message?: string): void {
  const output: CursorHookOutput = { permission: "allow" };
  if (message) output.userMessage = message;
  respond(output);
}

void runHook<BeforeMCPExecutionInput>({
  allow: allowThrough,
  configErrorMessage: "Prisma AIRS: configuration error — scan skipped (fail-open).",
  skip: (input) => {
    if (!input.tool_name) {
      console.error("[AIRS] No tool_name in input, allowing through.");
      return true;
    }
    return false;
  },
  handler: async (input, config, logger) => {
    const toolName = input.tool_name;

    // Empty-content and size-limit handling live in the scanner
    const result = await scanToolEvent(config, toolName, normalize(input.tool_input), undefined, logger);

    if (result.action === "block") {
      const output: CursorHookOutput = {
        permission: "deny",
        userMessage: result.message ?? "Prisma AIRS blocked this MCP tool call.",
        agentMessage: `AIRS security scan blocked ${toolName}. Do not retry this tool call. Inform the user that the tool input was flagged by security scanning.`,
      };
      respond(output);
      process.exit(2);
    }

    allowThrough(result.message);
  },
});
