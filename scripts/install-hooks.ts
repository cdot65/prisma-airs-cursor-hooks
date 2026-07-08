#!/usr/bin/env tsx
/**
 * Install Prisma AIRS hooks into Cursor.
 *
 * Usage:
 *   npx tsx scripts/install-hooks.ts                          # project-level (.cursor/hooks.json)
 *   npx tsx scripts/install-hooks.ts --global                 # user-level (~/.cursor/hooks.json)
 *   npx tsx scripts/install-hooks.ts --optional all           # also install every optional hook
 *   npx tsx scripts/install-hooks.ts --optional beforeShellExecution,beforeReadFile
 *
 * Cursor reads hooks.json from multiple locations (all execute if present):
 *   1. Project:    <workspace>/.cursor/hooks.json
 *   2. User:       ~/.cursor/hooks.json
 *   3. Enterprise: /Library/Application Support/Cursor/hooks.json  (macOS)
 *                  /etc/cursor/hooks.json                          (Linux)
 */
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { CursorHooksConfig } from "../src/types.js";
import { HOOK_DEFS, selectHooks, mergeHookEntries } from "./lib/hook-registry.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const isGlobal = process.argv.includes("--global");

/** Value following --optional, if present ("all" or csv of hook event names) */
function optionalArg(): string | undefined {
  const idx = process.argv.indexOf("--optional");
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) {
    console.error(
      "  ERROR: --optional requires a value: 'all' or a comma-separated list of hook names.",
    );
    process.exit(1);
  }
  return value;
}

// Determine target paths based on scope
const CURSOR_DIR = isGlobal
  ? join(homedir(), ".cursor")
  : join(process.cwd(), ".cursor");
const HOOKS_JSON_PATH = join(CURSOR_DIR, "hooks.json");
const AIRS_CONFIG_DIR = join(CURSOR_DIR, "hooks");
const AIRS_CONFIG_DEST = join(AIRS_CONFIG_DIR, "airs-config.json");

function main() {
  const scope = isGlobal ? "global (user-level)" : "project-level";
  console.log(`Installing Prisma AIRS Cursor hooks [${scope}]...\n`);

  let hookDefs;
  try {
    hookDefs = selectHooks(HOOK_DEFS, optionalArg());
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }

  // ---- Validate environment ----
  const apiKey = process.env.PRISMA_AIRS_API_KEY;
  const apiEndpoint = process.env.PRISMA_AIRS_API_ENDPOINT;

  if (!apiKey) {
    console.warn(
      "  WARNING: PRISMA_AIRS_API_KEY is not set in your environment.\n" +
        "  Hooks will fail-open until this variable is available.\n" +
        "  Set it with:  export PRISMA_AIRS_API_KEY=<your-x-pan-token>\n",
    );
  }
  if (!apiEndpoint) {
    console.warn(
      "  WARNING: PRISMA_AIRS_API_ENDPOINT is not set in your environment.\n" +
        "  Set it with:  export PRISMA_AIRS_API_ENDPOINT=https://<region>.api.prismacloud.io\n",
    );
  }

  // ---- Create directories ----
  mkdirSync(AIRS_CONFIG_DIR, { recursive: true });

  // ---- Write or merge hooks.json ----
  const distDir = join(PROJECT_ROOT, "dist", "hooks");

  // Verify dist exists
  if (!existsSync(distDir)) {
    console.error("  ERROR: dist/ not found. Run 'npm run build' first.\n");
    process.exit(1);
  }

  let existingConfig: CursorHooksConfig | null = null;
  if (existsSync(HOOKS_JSON_PATH)) {
    try {
      existingConfig = JSON.parse(readFileSync(HOOKS_JSON_PATH, "utf-8"));
      console.log(`  Found existing ${HOOKS_JSON_PATH} — merging AIRS hooks.\n`);
    } catch {
      console.warn(`  WARNING: existing hooks.json is invalid JSON — overwriting.\n`);
    }
  }

  const { config: hooksConfig } = mergeHookEntries(
    existingConfig ?? { version: 1, hooks: {} },
    hookDefs,
    distDir,
  );

  writeFileSync(HOOKS_JSON_PATH, JSON.stringify(hooksConfig, null, 2) + "\n", "utf-8");
  console.log(`  Wrote ${HOOKS_JSON_PATH}`);

  // ---- Copy AIRS config template ----
  if (!existsSync(AIRS_CONFIG_DEST)) {
    copyFileSync(join(PROJECT_ROOT, "airs-config.json"), AIRS_CONFIG_DEST);
    console.log(`  Copied airs-config.json → ${AIRS_CONFIG_DEST}`);
  } else {
    console.log(`  Config already exists at ${AIRS_CONFIG_DEST} (preserved)`);
  }

  // ---- Summary ----
  console.log("\n✅ Hooks installed successfully\n");
  if (isGlobal) {
    console.log("  Scope: GLOBAL — hooks apply to ALL Cursor workspaces.\n");
    console.log(`  hooks.json:  ${HOOKS_JSON_PATH}`);
    console.log(`  airs-config: ${AIRS_CONFIG_DEST}\n`);
  } else {
    console.log("  Scope: PROJECT — hooks apply only to this workspace.\n");
    console.log("  Tip: use --global to install for all workspaces:\n");
    console.log("    npm run install-hooks -- --global\n");
  }
  console.log("  Cursor will run these hooks automatically:");
  const pad = Math.max(...hookDefs.map((d) => d.event.length));
  for (const def of hookDefs) {
    const tag = def.optional ? " [optional]" : "";
    console.log(`    ${def.event.padEnd(pad)} → ${def.description}${tag}`);
  }
  const skippedOptional = HOOK_DEFS.filter(
    (d) => d.optional && !hookDefs.includes(d),
  );
  if (skippedOptional.length > 0) {
    console.log("\n  Optional hooks not installed (enable with --optional <name>|all):");
    for (const def of skippedOptional) {
      console.log(`    ${def.event.padEnd(pad)} → ${def.description}`);
    }
  }
  console.log("\n  Environment variables (set in your shell profile):");
  console.log("    PRISMA_AIRS_API_KEY            — x-pan-token for AIRS API (required)");
  console.log("    PRISMA_AIRS_API_ENDPOINT       — regional base URL (optional, defaults to US)");
  console.log("    PRISMA_AIRS_PROMPT_PROFILE     — prompt security profile name (optional)");
  console.log("    PRISMA_AIRS_RESPONSE_PROFILE   — response security profile name (optional)");
  console.log("    PRISMA_AIRS_TOOL_PROFILE       — tool security profile name (optional)\n");
  console.log("  Next steps:");
  console.log("    1. npm run validate-connection");
  console.log("    2. npm run validate-detection");
  console.log("    3. Restart Cursor to pick up the new hooks.json");
}

main();
