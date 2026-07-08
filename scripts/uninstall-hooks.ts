#!/usr/bin/env tsx
/**
 * Remove Prisma AIRS hook entries (core and optional) from hooks.json.
 *
 * Usage:
 *   npx tsx scripts/uninstall-hooks.ts             # project-level
 *   npx tsx scripts/uninstall-hooks.ts --global     # user-level (~/.cursor/hooks.json)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CursorHooksConfig } from "../src/types.js";
import { HOOK_DEFS, removeAirsEntries } from "./lib/hook-registry.js";

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

  const { config: cleaned, removed } = removeAirsEntries(config, HOOK_DEFS);

  if (removed === 0) {
    console.log("  No AIRS hook entries found in hooks.json.");
  } else {
    writeFileSync(HOOKS_JSON_PATH, JSON.stringify(cleaned, null, 2) + "\n", "utf-8");
    console.log(`  Removed ${removed} AIRS hook entry/entries from ${HOOKS_JSON_PATH}`);
  }

  console.log("\n✅ Hooks uninstalled");
  console.log("  AIRS config and logs preserved.");
  console.log("  Restart Cursor to apply changes.");
}

main();
