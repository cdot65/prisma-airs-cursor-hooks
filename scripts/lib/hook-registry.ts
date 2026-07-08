/**
 * Data-driven registry of every AIRS Cursor hook, plus pure helpers for
 * installing, removing, and verifying hook entries in a Cursor hooks.json.
 *
 * install-hooks / uninstall-hooks / verify-hooks all iterate HOOK_DEFS so
 * adding a hook means adding one entry here (and its src/hooks entry point).
 */
import type { CursorHooksConfig, CursorHookEntry } from "../../src/types.js";

export interface HookDef {
  /** Cursor hook event name (key in hooks.json) */
  event: string;
  /** dist/hooks file slug — also used to match/identify AIRS entries */
  slug: string;
  /** One-line summary printed by install/verify */
  description: string;
  /** Optional hooks are only installed with --optional */
  optional: boolean;
  /** Default failClosed for the hooks.json entry */
  failClosed: boolean;
}

export const HOOK_DEFS: HookDef[] = [
  {
    event: "beforeSubmitPrompt",
    slug: "before-submit-prompt",
    description: "scans prompts via Prisma AIRS (can block)",
    optional: false,
    failClosed: false,
  },
  {
    event: "afterAgentResponse",
    slug: "after-agent-response",
    description: "scans AI responses incl. code extraction (observe-only)",
    optional: false,
    failClosed: false,
  },
  {
    event: "beforeMCPExecution",
    slug: "before-mcp-execution",
    description: "scans MCP tool inputs via Prisma AIRS (can block)",
    optional: false,
    failClosed: false,
  },
  {
    event: "postToolUse",
    slug: "post-tool-use",
    description: "scans tool outputs for audit (observe-only)",
    optional: false,
    failClosed: false,
  },
];

const DEFAULT_TIMEOUT = 5000;

/** Build the hooks.json command string for a hook definition */
export function hookCommand(def: HookDef, distDir: string): string {
  return `node "${distDir}/${def.slug}.js"`;
}

/**
 * Resolve which hooks to install. `optionalArg` is the value of --optional:
 * undefined → core hooks only; "all" → everything; otherwise a comma-separated
 * list of optional hook event names to add on top of core.
 * Throws on names that aren't optional hooks in the registry.
 */
export function selectHooks(defs: HookDef[], optionalArg?: string): HookDef[] {
  const core = defs.filter((d) => !d.optional);
  if (optionalArg === undefined) return core;
  if (optionalArg === "all") return [...defs];

  const requested = optionalArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const optionalByEvent = new Map(
    defs.filter((d) => d.optional).map((d) => [d.event, d]),
  );

  const selected = [...core];
  for (const name of requested) {
    const def = optionalByEvent.get(name);
    if (!def) {
      const known = [...optionalByEvent.keys()].join(", ") || "(none)";
      throw new Error(
        `Unknown optional hook "${name}". Optional hooks: ${known}`,
      );
    }
    selected.push(def);
  }
  return selected;
}

/** True when the config already has an AIRS entry for this hook */
export function checkRegistered(config: CursorHooksConfig, def: HookDef): boolean {
  return Boolean(
    config.hooks[def.event]?.some((h) => h.command.includes(def.slug)),
  );
}

/**
 * Idempotently add hooks.json entries for the given hook definitions.
 * Foreign (non-AIRS) entries are preserved. Returns the merged config and
 * the list of hook events that were newly added.
 */
export function mergeHookEntries(
  config: CursorHooksConfig,
  defs: HookDef[],
  distDir: string,
): { config: CursorHooksConfig; added: string[] } {
  const added: string[] = [];
  for (const def of defs) {
    if (checkRegistered(config, def)) continue;
    const entry: CursorHookEntry = {
      command: hookCommand(def, distDir),
      timeout: DEFAULT_TIMEOUT,
      failClosed: def.failClosed,
    };
    (config.hooks[def.event] ??= []).push(entry);
    added.push(def.event);
  }
  return { config, added };
}

/**
 * Remove every AIRS entry (core and optional) from the config, deleting
 * hook arrays that end up empty. Returns the cleaned config and a count.
 */
export function removeAirsEntries(
  config: CursorHooksConfig,
  defs: HookDef[],
): { config: CursorHooksConfig; removed: number } {
  let removed = 0;
  for (const def of defs) {
    const entries = config.hooks[def.event];
    if (!entries) continue;
    const kept = entries.filter((h) => !h.command.includes(def.slug));
    removed += entries.length - kept.length;
    if (kept.length === 0) {
      delete config.hooks[def.event];
    } else {
      config.hooks[def.event] = kept;
    }
  }
  return { config, removed };
}
