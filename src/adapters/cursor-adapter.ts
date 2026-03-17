import type { HookResult, CursorHookOutput } from "../types.js";
import type { HookAdapter } from "./types.js";

/**
 * Cursor IDE hook adapter.
 *
 * Cursor hooks contract (v1):
 *   stdin  → structured JSON with event-specific fields
 *   stdout → JSON { permission: "allow"|"deny"|"ask", userMessage?, agentMessage? }
 *   exit 0 = success; exit 2 = deny
 *   stderr → debug logs (shown in Cursor's "Hooks" output panel)
 *
 * Environment variables injected by Cursor:
 *   CURSOR_PROJECT_DIR, CURSOR_VERSION, CURSOR_USER_EMAIL,
 *   CURSOR_TRANSCRIPT_PATH, CURSOR_CODE_REMOTE
 */
export class CursorHookAdapter implements HookAdapter {
  private preSendHandler?: (content: string) => Promise<HookResult>;
  private preDisplayHandler?: (content: string) => Promise<HookResult>;

  registerPreSend(handler: (content: string) => Promise<HookResult>): void {
    this.preSendHandler = handler;
  }

  registerPreDisplay(handler: (content: string) => Promise<HookResult>): void {
    this.preDisplayHandler = handler;
  }

  /** Execute a hook given parsed content and the registered handler */
  async execute(
    content: string,
    handler?: (content: string) => Promise<HookResult>,
  ): Promise<void> {
    if (!handler) {
      this.respond({ permission: "allow" });
      return;
    }

    try {
      const result = await handler(content);

      if (result.action === "block") {
        this.respond({
          permission: "deny",
          userMessage: result.message ?? "Blocked by Prisma AIRS.",
        });
        return;
      }

      const output: CursorHookOutput = { permission: "allow" };
      if (result.message) output.userMessage = result.message;
      this.respond(output);
    } catch {
      // Fail-open
      this.respond({ permission: "allow" });
    }
  }

  private respond(output: CursorHookOutput): void {
    process.stdout.write(JSON.stringify(output) + "\n");
  }
}
