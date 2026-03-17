#!/usr/bin/env tsx
/**
 * Install Prisma AIRS hooks into Cursor.
 *
 * Usage:
 *   npx tsx scripts/install-hooks.ts             # project-level (.cursor/hooks.json)
 *   npx tsx scripts/install-hooks.ts --global     # user-level (~/.cursor/hooks.json)
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

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const isGlobal = process.argv.includes("--global");

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

  // ---- Validate environment ----
  const apiKey = process.env.AIRS_API_KEY;
  const apiEndpoint = process.env.AIRS_API_ENDPOINT;

  if (!apiKey) {
    console.warn(
      "  WARNING: AIRS_API_KEY is not set in your environment.\n" +
        "  Hooks will fail-open until this variable is available.\n" +
        "  Set it with:  export AIRS_API_KEY=<your-x-pan-token>\n",
    );
  }
  if (!apiEndpoint) {
    console.warn(
      "  WARNING: AIRS_API_ENDPOINT is not set in your environment.\n" +
        "  Set it with:  export AIRS_API_ENDPOINT=https://<region>.api.prismacloud.io\n",
    );
  }

  // ---- Create directories ----
  mkdirSync(AIRS_CONFIG_DIR, { recursive: true });

  // ---- Write or merge hooks.json ----
  const distDir = join(PROJECT_ROOT, "dist", "hooks");
  const beforePromptCmd = `node "${join(distDir, "before-submit-prompt.js")}"`;
  const afterResponseCmd = `node "${join(distDir, "after-agent-response.js")}"`;

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

  const hooksConfig: CursorHooksConfig = existingConfig ?? {
    version: 1,
    hooks: {},
  };

  // Ensure our hooks are registered (idempotent — don't duplicate)
  if (!hooksConfig.hooks.beforeSubmitPrompt) {
    hooksConfig.hooks.beforeSubmitPrompt = [];
  }
  const hasPromptHook = hooksConfig.hooks.beforeSubmitPrompt.some(
    (h) => h.command.includes("before-submit-prompt"),
  );
  if (!hasPromptHook) {
    hooksConfig.hooks.beforeSubmitPrompt.push({
      command: beforePromptCmd,
      timeout: 5000,
      failClosed: false,
    });
  }

  if (!hooksConfig.hooks.afterAgentResponse) {
    hooksConfig.hooks.afterAgentResponse = [];
  }
  const hasResponseHook = hooksConfig.hooks.afterAgentResponse.some(
    (h) => h.command.includes("after-agent-response"),
  );
  if (!hasResponseHook) {
    hooksConfig.hooks.afterAgentResponse.push({
      command: afterResponseCmd,
      timeout: 5000,
      failClosed: false,
    });
  }

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
  console.log("    beforeSubmitPrompt  → scans prompts via Prisma AIRS");
  console.log("    afterAgentResponse  → scans AI responses (incl. code extraction)\n");
  console.log("  Environment variables (set in your shell profile):");
  console.log("    AIRS_API_KEY            — x-pan-token for AIRS API (required)");
  console.log("    AIRS_API_ENDPOINT       — regional base URL (optional, defaults to US)");
  console.log("    AIRS_PROMPT_PROFILE     — prompt security profile name (optional)");
  console.log("    AIRS_RESPONSE_PROFILE   — response security profile name (optional)\n");
  console.log("  Next steps:");
  console.log("    1. npm run validate-connection");
  console.log("    2. npm run validate-detection");
  console.log("    3. Restart Cursor to pick up the new hooks.json");
}

main();
