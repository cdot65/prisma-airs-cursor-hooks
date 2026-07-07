#!/usr/bin/env node
/**
 * Cursor hook: beforeSubmitPrompt (can block)
 *
 * Intercepts the developer's prompt before it is sent to the AI model.
 *
 * Cursor contract:
 *   stdin  → JSON { prompt, conversation_id, model, user_email, ... }
 *   stdout → JSON { continue: true|false, user_message? }
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { runHook, respond } from "./run-hook.js";
import { scanPrompt } from "../scanner.js";
import type { BeforeSubmitPromptInput, BeforeSubmitPromptOutput } from "../types.js";

function emit(output: BeforeSubmitPromptOutput): void {
  respond(output);
}

function allowThrough(): void {
  emit({ continue: true });
}

void runHook<BeforeSubmitPromptInput>({
  allow: allowThrough,
  handler: async (input, config, logger) => {
    const result = await scanPrompt(config, input.prompt, logger);

    if (result.action === "block") {
      emit({
        continue: false,
        user_message: result.message ?? "Prisma AIRS blocked this prompt.",
      });
      return;
    }

    allowThrough();
  },
});
