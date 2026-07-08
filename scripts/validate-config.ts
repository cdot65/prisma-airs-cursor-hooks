#!/usr/bin/env tsx
/**
 * Validate the end-user AIRS configuration without touching the API.
 * Checks file resolution, JSON syntax, required fields, and environment.
 * Run: npx tsx scripts/validate-config.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveConfigPath, loadConfig } from "../src/config.js";

const VALID_MODES = ["observe", "enforce", "bypass"];

function main() {
  console.log("Validating AIRS configuration...\n");
  let issues = 0;
  const warn = (msg: string) => console.log(`  ⚠️  ${msg}`);
  const fail = (msg: string) => { console.log(`  ❌ ${msg}`); issues++; };
  const ok = (msg: string) => console.log(`  ✅ ${msg}`);

  // 1. Resolution
  const path = resolveConfigPath();
  if (!existsSync(path)) {
    fail(`No config file found (searched project and global locations; would create at ${path})`);
    console.log(`\n❌ ${issues} issue(s) found. Run 'prisma-airs-hooks doctor' to repair.`);
    process.exit(1);
  }
  ok(`Config file: ${path}`);

  // 2. JSON syntax
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
    ok("Valid JSON");
  } catch (err) {
    fail(`Invalid JSON: ${err}`);
    console.log(`\n❌ ${issues} issue(s) found. Run 'prisma-airs-hooks doctor' to repair.`);
    process.exit(1);
  }

  // 3. Field-level checks (mirror loadConfig rules, but report all at once)
  const mode = parsed.mode as string;
  if (VALID_MODES.includes(mode)) {
    ok(`Mode: ${mode}`);
    if (mode === "bypass") warn("Mode is 'bypass' — no scanning is happening");
  } else {
    fail(`Invalid mode "${mode}" (must be one of: ${VALID_MODES.join(", ")})`);
  }

  const apiKeyEnvVar = (parsed.apiKeyEnvVar as string) || "PRISMA_AIRS_API_KEY";
  const apiKey = process.env[apiKeyEnvVar];
  if (apiKey?.trim()) {
    ok(`API key present in $${apiKeyEnvVar}`);
  } else {
    fail(`API key env var $${apiKeyEnvVar} is not set or empty`);
  }

  const profiles = parsed.profiles as Record<string, string> | undefined;
  if (profiles?.prompt && profiles?.response) {
    ok(`Profiles: prompt="${profiles.prompt}" response="${profiles.response}" tool="${profiles.tool ?? "(falls back)"}"`);
  } else {
    fail("Config must include profiles.prompt and profiles.response");
  }

  if (typeof parsed.timeout_ms === "number" && parsed.timeout_ms > 0) {
    ok(`Timeout: ${parsed.timeout_ms}ms`);
  } else {
    fail("timeout_ms must be a positive number");
  }

  // 4. Full loadConfig pass — catches anything the checks above missed
  //    and resolves env-var references / defaults the way the hooks do.
  try {
    const config = loadConfig(path);
    ok(`Endpoint: ${config.endpoint}`);
    ok(`Resolved profiles: prompt="${config.profiles.prompt}" response="${config.profiles.response}" tool="${config.profiles.tool}"`);
    ok(`Log path: ${config.logging.path}`);
    if (!existsSync(dirname(config.logging.path))) {
      warn(`Log directory does not exist yet: ${dirname(config.logging.path)} (created on first write)`);
    }
    if (config.logging.include_content) {
      warn("logging.include_content=true — scanned content (possibly sensitive) is written to the log");
    }
    if (config.sanitize_mcp_output) {
      ok("MCP output sanitization: enabled (flagged MCP tool output is replaced in enforce mode)");
      if (config.mode !== "enforce") {
        warn("sanitize_mcp_output=true has no effect outside enforce mode");
      }
    } else {
      ok("MCP output sanitization: disabled (postToolUse is observe-only)");
    }
  } catch (err) {
    fail(`loadConfig failed: ${err instanceof Error ? err.message : err}`);
  }

  if (issues === 0) {
    console.log("\n✅ Configuration is valid");
  } else {
    console.log(`\n❌ ${issues} issue(s) found. Run 'prisma-airs-hooks doctor' to repair.`);
    process.exit(1);
  }
}

main();
