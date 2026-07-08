#!/usr/bin/env node
/**
 * Cursor hook: afterAgentResponse (observe-only)
 *
 * Fires AFTER the AI response is already displayed to the developer.
 * Cursor treats this as an observational hook — it cannot block or hide
 * the response. We scan for DLP / malicious content and **log** violations
 * for audit; a userMessage warning is emitted so Cursor may surface it in
 * the Hooks output panel.
 *
 * Cursor contract:
 *   stdin  → JSON { text, conversation_id, model, user_email, ... }
 *   stdout → ignored by Cursor (we still emit JSON for logging consistency)
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { runHook, respond } from "./run-hook.js";
import { scanResponse } from "../scanner.js";
import type { AfterAgentResponseInput, CursorHookOutput } from "../types.js";

function allowThrough(message?: string): void {
  const output: CursorHookOutput = { permission: "allow" };
  if (message) output.userMessage = message;
  respond(output);
}

void runHook<AfterAgentResponseInput>({
  allow: allowThrough,
  configErrorMessage: "Prisma AIRS: configuration error — scan skipped (fail-open).",
  handler: async (input, config, logger) => {
    const result = await scanResponse(config, input.text, logger);

    if (result.action === "block") {
      // afterAgentResponse is observe-only — Cursor ignores deny/exit(2).
      // Log the violation and surface a warning; the response is already visible.
      console.error(`[AIRS] Response violation detected (observe-only, cannot block).`);
      allowThrough(
        result.message ?? "⚠ Prisma AIRS: this response was flagged but could not be blocked (afterAgentResponse is observe-only).",
      );
      return;
    }

    allowThrough(result.message);
  },
});
