/**
 * Shared harness for Cursor hook entry points.
 *
 * Owns the lifecycle every hook repeats: read stdin, parse JSON, expose the
 * Cursor-provided identity, load config, build the logger, and fail open on
 * any error. A hook supplies only its output shape (via `allow`) and its
 * scan/verdict logic (via `handler`).
 */
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import type { AirsConfig, CursorHookInput } from "../types.js";

/** Read all of stdin as a string */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Write a hook response object to stdout as a single JSON line */
export function respond(output: unknown): void {
  process.stdout.write(JSON.stringify(output) + "\n");
}

export interface RunHookOptions<TInput extends CursorHookInput> {
  /** Emit the hook's fail-open (allow) response, optionally with a user-facing message */
  allow: (message?: string) => void;
  /** Message passed to `allow` when config loading fails (omit for silent fail-open) */
  configErrorMessage?: string;
  /**
   * Return true to allow through before config is loaded — keeps no-op events
   * (skipped tools, malformed input) cheap and silent even when config is broken.
   */
  skip?: (input: TInput) => boolean;
  /** Hook-specific logic; must write its own response via respond()/allow() */
  handler: (input: TInput, config: AirsConfig, logger: Logger) => Promise<void>;
}

export async function runHook<TInput extends CursorHookInput>(
  opts: RunHookOptions<TInput>,
): Promise<void> {
  try {
    const raw = await readStdin();

    let input: TInput;
    try {
      input = JSON.parse(raw);
    } catch {
      console.error("[AIRS] Failed to parse hook stdin as JSON.");
      opts.allow();
      return;
    }

    // Expose Cursor-provided identity as env var for downstream use
    if (input.user_email) {
      process.env.CURSOR_USER_EMAIL = input.user_email;
    }

    if (opts.skip?.(input)) {
      opts.allow();
      return;
    }

    let config: AirsConfig;
    try {
      config = loadConfig();
    } catch (err) {
      console.error(`[AIRS] Config error: ${err}`);
      opts.allow(opts.configErrorMessage);
      return;
    }

    const logger = new Logger(config.logging.path, config.logging.include_content);
    await opts.handler(input, config, logger);
  } catch (err) {
    // Fail-open: never block the developer on unhandled errors
    console.error(`[AIRS] Unhandled hook error: ${err}`);
    opts.allow();
  }
}
