#!/usr/bin/env tsx
/**
 * Tamper detection: verify Cursor hooks.json contains AIRS hook entries
 * and that the AIRS config file is present.
 *
 * Core hooks missing → failure (exit 1). Optional hooks are reported but
 * never fail verification — they're only present when installed with
 * `install-hooks --optional`.
 *
 * Run: npx tsx scripts/verify-hooks.ts            # project-level (.cursor/)
 *      npx tsx scripts/verify-hooks.ts --global    # user-level (~/.cursor/)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cursorDir } from "./lib/paths.js";
import { HOOK_DEFS, checkRegistered } from "./lib/hook-registry.js";
import type { CursorHooksConfig } from "../src/types.js";

const isGlobal = process.argv.includes("--global");
const CURSOR_DIR = cursorDir(isGlobal);
const HOOKS_JSON = join(CURSOR_DIR, "hooks.json");
const AIRS_CONFIG = join(CURSOR_DIR, "hooks", "airs-config.json");
const scopeLabel = isGlobal ? "~/.cursor" : ".cursor";

function main() {
  const scope = isGlobal ? "global (user-level)" : "project-level";
  console.log(`Verifying Prisma AIRS hook integrity [${scope}]...\n`);
  let issues = 0;

  // Check hooks.json exists
  if (!existsSync(HOOKS_JSON)) {
    console.log(`  ❌ MISSING: ${scopeLabel}/hooks.json`);
    issues++;
  } else {
    console.log(`  ✅ Found:   ${scopeLabel}/hooks.json`);

    // Verify AIRS entries are present
    try {
      const config: CursorHooksConfig = JSON.parse(readFileSync(HOOKS_JSON, "utf-8"));
      const pad = Math.max(...HOOK_DEFS.map((d) => d.event.length));

      for (const def of HOOK_DEFS) {
        const registered = checkRegistered(config, def);
        if (registered) {
          console.log(`  ✅ Registered: ${def.event.padEnd(pad)} → ${def.description}`);
        } else if (def.optional) {
          console.log(`  ⚪ Optional:   ${def.event.padEnd(pad)} not installed (enable with --optional)`);
        } else {
          console.log(`  ❌ MISSING:    ${def.event} hook entry`);
          issues++;
        }
      }
    } catch {
      console.log("  ❌ ERROR:   hooks.json is invalid JSON");
      issues++;
    }
  }

  // Check AIRS config
  if (existsSync(AIRS_CONFIG)) {
    console.log(`  ✅ Found:   ${scopeLabel}/hooks/airs-config.json`);
  } else {
    console.log(`  ❌ MISSING: ${scopeLabel}/hooks/airs-config.json`);
    issues++;
  }

  // Check env vars
  if (process.env.PRISMA_AIRS_API_KEY) {
    console.log("  ✅ Set:     PRISMA_AIRS_API_KEY");
  } else {
    console.log("  ⚠️  NOT SET: PRISMA_AIRS_API_KEY (hooks will fail-open)");
  }
  if (process.env.PRISMA_AIRS_API_ENDPOINT) {
    console.log("  ✅ Set:     PRISMA_AIRS_API_ENDPOINT");
  } else {
    console.log("  ⚠️  NOT SET: PRISMA_AIRS_API_ENDPOINT");
  }

  console.log("");
  if (issues === 0) {
    console.log(`✅ All hooks intact and correctly configured [${scope}].`);
  } else {
    const restore = isGlobal
      ? "npm run install-hooks -- --global"
      : "npm run install-hooks";
    console.log(`⚠️  ${issues} issue(s) found. Run '${restore}' to restore.`);
    if (!isGlobal) {
      console.log("    Installed globally? Re-run with --global:  npm run verify-hooks -- --global");
    }
    process.exit(1);
  }
}

main();
