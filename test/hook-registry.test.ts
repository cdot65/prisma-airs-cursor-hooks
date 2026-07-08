import { describe, it, expect } from "vitest";
import type { CursorHooksConfig } from "../src/types.js";
import {
  HOOK_DEFS,
  hookCommand,
  selectHooks,
  mergeHookEntries,
  removeAirsEntries,
  checkRegistered,
  type HookDef,
} from "../scripts/lib/hook-registry.js";

const DIST = "/opt/pkg/dist/hooks";

const CORE_EVENTS = [
  "beforeSubmitPrompt",
  "afterAgentResponse",
  "beforeMCPExecution",
  "postToolUse",
];

/** Small synthetic registry for exercising optional-selection logic */
const TEST_DEFS: HookDef[] = [
  {
    event: "beforeSubmitPrompt",
    slug: "before-submit-prompt",
    description: "scans prompts",
    optional: false,
    failClosed: false,
  },
  {
    event: "beforeShellExecution",
    slug: "before-shell-execution",
    description: "scans shell commands",
    optional: true,
    failClosed: false,
  },
  {
    event: "afterShellExecution",
    slug: "after-shell-execution",
    description: "scans shell output",
    optional: true,
    failClosed: false,
  },
];

function emptyConfig(): CursorHooksConfig {
  return { version: 1, hooks: {} };
}

describe("HOOK_DEFS registry", () => {
  it("contains the four core hooks as non-optional", () => {
    const coreEvents = HOOK_DEFS.filter((d) => !d.optional).map((d) => d.event);
    expect(coreEvents.sort()).toEqual([...CORE_EVENTS].sort());
  });

  it("uses unique slugs and events", () => {
    const slugs = HOOK_DEFS.map((d) => d.slug);
    const events = HOOK_DEFS.map((d) => d.event);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(events).size).toBe(events.length);
  });
});

describe("hookCommand", () => {
  it("builds a node command pointing at the dist file", () => {
    const def = TEST_DEFS[0];
    expect(hookCommand(def, DIST)).toBe(`node "${DIST}/before-submit-prompt.js"`);
  });
});

describe("selectHooks", () => {
  it("returns only core hooks when no optional arg given", () => {
    const selected = selectHooks(TEST_DEFS, undefined);
    expect(selected.map((d) => d.event)).toEqual(["beforeSubmitPrompt"]);
  });

  it("returns all hooks for 'all'", () => {
    const selected = selectHooks(TEST_DEFS, "all");
    expect(selected).toHaveLength(3);
  });

  it("returns core plus named optional hooks for a csv list", () => {
    const selected = selectHooks(TEST_DEFS, "beforeShellExecution");
    expect(selected.map((d) => d.event)).toEqual([
      "beforeSubmitPrompt",
      "beforeShellExecution",
    ]);
  });

  it("accepts multiple csv names with whitespace", () => {
    const selected = selectHooks(TEST_DEFS, "beforeShellExecution, afterShellExecution");
    expect(selected).toHaveLength(3);
  });

  it("throws on unknown optional hook names", () => {
    expect(() => selectHooks(TEST_DEFS, "nopeHook")).toThrow(/nopeHook/);
  });

  it("throws when naming a core hook as optional", () => {
    expect(() => selectHooks(TEST_DEFS, "beforeSubmitPrompt")).toThrow(
      /beforeSubmitPrompt/,
    );
  });
});

describe("mergeHookEntries", () => {
  it("registers each selected hook with timeout and failClosed defaults", () => {
    const { config, added } = mergeHookEntries(emptyConfig(), TEST_DEFS, DIST);
    expect(added.sort()).toEqual(
      ["beforeSubmitPrompt", "beforeShellExecution", "afterShellExecution"].sort(),
    );
    const entry = config.hooks.beforeSubmitPrompt[0];
    expect(entry).toEqual({
      command: `node "${DIST}/before-submit-prompt.js"`,
      timeout: 5000,
      failClosed: false,
    });
  });

  it("is idempotent — merging twice adds nothing", () => {
    const first = mergeHookEntries(emptyConfig(), TEST_DEFS, DIST);
    const second = mergeHookEntries(first.config, TEST_DEFS, DIST);
    expect(second.added).toEqual([]);
    expect(second.config.hooks.beforeSubmitPrompt).toHaveLength(1);
  });

  it("preserves foreign (non-AIRS) entries", () => {
    const config = emptyConfig();
    config.hooks.beforeSubmitPrompt = [{ command: "./my-other-hook.sh" }];
    const { config: merged } = mergeHookEntries(config, TEST_DEFS, DIST);
    expect(merged.hooks.beforeSubmitPrompt).toHaveLength(2);
    expect(merged.hooks.beforeSubmitPrompt[0].command).toBe("./my-other-hook.sh");
  });
});

describe("removeAirsEntries", () => {
  it("removes AIRS entries and cleans up empty arrays", () => {
    const { config } = mergeHookEntries(emptyConfig(), TEST_DEFS, DIST);
    const { config: cleaned, removed } = removeAirsEntries(config, TEST_DEFS);
    expect(removed).toBe(3);
    expect(cleaned.hooks.beforeSubmitPrompt).toBeUndefined();
    expect(cleaned.hooks.beforeShellExecution).toBeUndefined();
  });

  it("keeps foreign entries and their arrays", () => {
    const config = emptyConfig();
    config.hooks.beforeSubmitPrompt = [{ command: "./my-other-hook.sh" }];
    const { config: merged } = mergeHookEntries(config, TEST_DEFS, DIST);
    const { config: cleaned, removed } = removeAirsEntries(merged, TEST_DEFS);
    expect(removed).toBe(3);
    expect(cleaned.hooks.beforeSubmitPrompt).toEqual([
      { command: "./my-other-hook.sh" },
    ]);
  });

  it("removes optional-hook entries even without flags", () => {
    const { config } = mergeHookEntries(emptyConfig(), selectHooks(TEST_DEFS, "all"), DIST);
    const { removed } = removeAirsEntries(config, TEST_DEFS);
    expect(removed).toBe(3);
  });

  it("reports zero when nothing is registered", () => {
    const { removed } = removeAirsEntries(emptyConfig(), TEST_DEFS);
    expect(removed).toBe(0);
  });
});

describe("checkRegistered", () => {
  it("detects registered and unregistered hooks", () => {
    const { config } = mergeHookEntries(
      emptyConfig(),
      selectHooks(TEST_DEFS, undefined),
      DIST,
    );
    expect(checkRegistered(config, TEST_DEFS[0])).toBe(true);
    expect(checkRegistered(config, TEST_DEFS[1])).toBe(false);
  });
});
