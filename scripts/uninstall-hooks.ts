#!/usr/bin/env tsx
/**
 * Remove Prisma AIRS hook entries from hooks.json.
 *
 * Usage:
 *   npx tsx scripts/uninstall-hooks.ts             # project-level
 *   npx tsx scripts/uninstall-hooks.ts --global     # user-level (~/.cursor/hooks.json)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CursorHooksConfig } from "../src/types.js";

const isGlobal = process.argv.includes("--global");
const HOOKS_JSON_PATH = isGlobal
  ? join(homedir(), ".cursor", "hooks.json")
  : join(process.cwd(), ".cursor", "hooks.json");

function main() {
  const scope = isGlobal ? "global" : "project";
  console.log(`Uninstalling Prisma AIRS Cursor hooks [${scope}]...\n`);

  if (!existsSync(HOOKS_JSON_PATH)) {
    console.log(`  No ${HOOKS_JSON_PATH} found — nothing to uninstall.`);
    return;
  }

  let config: CursorHooksConfig;
  try {
    config = JSON.parse(readFileSync(HOOKS_JSON_PATH, "utf-8"));
  } catch {
    console.error("  ERROR: hooks.json is invalid JSON.");
    return;
  }

  let removed = 0;

  if (config.hooks.beforeSubmitPrompt) {
    const before = config.hooks.beforeSubmitPrompt.length;
    config.hooks.beforeSubmitPrompt = config.hooks.beforeSubmitPrompt.filter(
      (h) => !h.command.includes("before-submit-prompt.ts"),
    );
    removed += before - config.hooks.beforeSubmitPrompt.length;
    if (config.hooks.beforeSubmitPrompt.length === 0) {
      delete config.hooks.beforeSubmitPrompt;
    }
  }

  if (config.hooks.afterAgentResponse) {
    const before = config.hooks.afterAgentResponse.length;
    config.hooks.afterAgentResponse = config.hooks.afterAgentResponse.filter(
      (h) => !h.command.includes("after-agent-response.ts"),
    );
    removed += before - config.hooks.afterAgentResponse.length;
    if (config.hooks.afterAgentResponse.length === 0) {
      delete config.hooks.afterAgentResponse;
    }
  }

  if (removed === 0) {
    console.log("  No AIRS hook entries found in hooks.json.");
  } else {
    writeFileSync(HOOKS_JSON_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
    console.log(`  Removed ${removed} AIRS hook entry/entries from ${HOOKS_JSON_PATH}`);
  }

  console.log("\n✅ Hooks uninstalled");
  console.log("  AIRS config and logs preserved.");
  console.log("  Restart Cursor to apply changes.");
}

main();
