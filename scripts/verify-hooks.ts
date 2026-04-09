#!/usr/bin/env tsx
/**
 * Tamper detection: verify Cursor hooks.json contains AIRS hook entries
 * and that the AIRS config file is present.
 *
 * Run: npx tsx scripts/verify-hooks.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CURSOR_DIR = join(process.cwd(), ".cursor");
const HOOKS_JSON = join(CURSOR_DIR, "hooks.json");
const AIRS_CONFIG = join(CURSOR_DIR, "hooks", "airs-config.json");

function main() {
  console.log("Verifying Prisma AIRS hook integrity...\n");
  let issues = 0;

  // Check hooks.json exists
  if (!existsSync(HOOKS_JSON)) {
    console.log("  ❌ MISSING: .cursor/hooks.json");
    issues++;
  } else {
    console.log("  ✅ Found:   .cursor/hooks.json");

    // Verify AIRS entries are present
    try {
      const config = JSON.parse(readFileSync(HOOKS_JSON, "utf-8"));
      const hasPromptHook = config.hooks?.beforeSubmitPrompt?.some(
        (h: { command: string }) => h.command.includes("before-submit-prompt"),
      );
      const hasResponseHook = config.hooks?.afterAgentResponse?.some(
        (h: { command: string }) => h.command.includes("after-agent-response"),
      );
      const hasMCPHook = config.hooks?.beforeMCPExecution?.some(
        (h: { command: string }) => h.command.includes("before-mcp-execution"),
      );
      const hasPostToolHook = config.hooks?.postToolUse?.some(
        (h: { command: string }) => h.command.includes("post-tool-use"),
      );

      if (hasPromptHook) {
        console.log("  ✅ Registered: beforeSubmitPrompt → AIRS prompt scan");
      } else {
        console.log("  ❌ MISSING:    beforeSubmitPrompt hook entry");
        issues++;
      }

      if (hasResponseHook) {
        console.log("  ✅ Registered: afterAgentResponse → AIRS response scan");
      } else {
        console.log("  ❌ MISSING:    afterAgentResponse hook entry");
        issues++;
      }

      if (hasMCPHook) {
        console.log("  ✅ Registered: beforeMCPExecution → AIRS MCP tool scan");
      } else {
        console.log("  ❌ MISSING:    beforeMCPExecution hook entry");
        issues++;
      }

      if (hasPostToolHook) {
        console.log("  ✅ Registered: postToolUse → AIRS tool output audit");
      } else {
        console.log("  ❌ MISSING:    postToolUse hook entry");
        issues++;
      }
    } catch {
      console.log("  ❌ ERROR:   hooks.json is invalid JSON");
      issues++;
    }
  }

  // Check AIRS config
  if (existsSync(AIRS_CONFIG)) {
    console.log("  ✅ Found:   .cursor/hooks/airs-config.json");
  } else {
    console.log("  ❌ MISSING: .cursor/hooks/airs-config.json");
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
    console.log("✅ All hooks intact and correctly configured.");
  } else {
    console.log(`⚠️  ${issues} issue(s) found. Run 'npm run install-hooks' to restore.`);
    process.exit(1);
  }
}

main();
