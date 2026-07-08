#!/usr/bin/env node
/**
 * Cursor hook: postToolUse (observe + optional MCP output sanitization)
 *
 * Fires after any tool executes. Scans tool outputs for security violations.
 * Cannot block the tool (it already ran), but for MCP tools Cursor honors
 * updated_mcp_tool_output — when sanitize_mcp_output is enabled and the scan
 * blocks in enforce mode, the flagged output is replaced with a redaction
 * notice before it reaches the model. All other cases are observe-only.
 * Routing lives in src/tool-routing.ts.
 *
 * Cursor contract:
 *   stdin  → JSON { tool_name, tool_input, tool_output, tool_use_id, ... }
 *   stdout → JSON {} or { updated_mcp_tool_output, additional_context }
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

    if (result?.action === "block") {
      // MCP tools only: Cursor replaces the output the model sees with
      // updated_mcp_tool_output. Opt-in via sanitize_mcp_output; the block
      // action already implies enforce mode.
      if (config.sanitize_mcp_output && toolName.startsWith("MCP:")) {
        logger.logEvent("mcp_output_sanitized", { tool: toolName });
        console.error(`[AIRS] postToolUse sanitized MCP output for tool=${toolName}.`);
        respond({
          updated_mcp_tool_output: {
            airs_sanitized: true,
            message:
              result.message ??
              "Prisma AIRS flagged this tool output. The content was removed before reaching the model.",
          },
          additional_context: `Prisma AIRS sanitized the output of ${toolName}: the scan flagged the content, so it was replaced before reaching the model. Do not ask for the raw output.`,
        });
        return;
      }

      console.error(`[AIRS] postToolUse violation detected for tool=${toolName} (observe-only, cannot block).`);
    }

    allowThrough();
  },
});
