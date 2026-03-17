import type { HookResult } from "../types.js";

/** IDE hook adapter interface — implement per IDE */
export interface HookAdapter {
  /** Register a handler for pre-send (prompt interception) */
  registerPreSend(
    handler: (content: string) => Promise<HookResult>,
  ): void;

  /** Register a handler for pre-display (response interception) */
  registerPreDisplay(
    handler: (content: string) => Promise<HookResult>,
  ): void;
}
