#!/usr/bin/env tsx
/**
 * Diagnose and repair the AIRS hooks installation.
 *
 * Safe repairs are applied automatically:
 *   - create a config template when none exists
 *   - reset an invalid mode to "observe"
 *   - fill missing profiles/timeout/retry/logging fields with defaults
 *   - create the log directory
 * Everything else (missing API key, unregistered hooks, missing dist build)
 * is reported with the command that fixes it.
 *
 * Run: npx tsx scripts/doctor.ts
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { resolveConfigPath, loadConfig } from "../src/config.js";
import { globalConfigPath } from "./lib/paths.js";

const VALID_MODES = ["observe", "enforce", "bypass"];

const CONFIG_TEMPLATE = {
  endpoint: "${PRISMA_AIRS_API_ENDPOINT}",
  apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
  profiles: {
    prompt: "${PRISMA_AIRS_PROMPT_PROFILE}",
    response: "${PRISMA_AIRS_RESPONSE_PROFILE}",
    tool: "${PRISMA_AIRS_TOOL_PROFILE}",
  },
  mode: "observe",
  timeout_ms: 3000,
  retry: { enabled: true, max_attempts: 1, backoff_base_ms: 200 },
  logging: { path: "~/.cursor/hooks/airs-scan.log", include_content: false },
};

function main() {
  console.log("Prisma AIRS doctor — diagnosing...\n");
  let repaired = 0;
  let advised = 0;
  const fixed = (msg: string) => { console.log(`  🔧 FIXED:  ${msg}`); repaired++; };
  const advise = (msg: string) => { console.log(`  👉 ACTION: ${msg}`); advised++; };
  const ok = (msg: string) => console.log(`  ✅ ${msg}`);

  // --- Config file ---
  let configPath = resolveConfigPath();
  if (!existsSync(configPath)) {
    configPath = globalConfigPath();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(CONFIG_TEMPLATE, null, 2) + "\n");
    fixed(`Created config template at ${configPath}`);
  } else {
    ok(`Config file: ${configPath}`);
  }

  // --- JSON syntax ---
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    const backup = `${configPath}.broken`;
    writeFileSync(backup, readFileSync(configPath));
    writeFileSync(configPath, JSON.stringify(CONFIG_TEMPLATE, null, 2) + "\n");
    fixed(`Config was invalid JSON — replaced with template (original saved to ${backup})`);
    config = JSON.parse(JSON.stringify(CONFIG_TEMPLATE));
  }

  // --- Field repairs ---
  let dirty = false;
  if (!VALID_MODES.includes(config.mode as string)) {
    config.mode = "observe";
    fixed(`Invalid mode reset to "observe"`);
    dirty = true;
  }
  for (const [key, value] of Object.entries(CONFIG_TEMPLATE)) {
    if (key === "mode") continue;
    if (config[key] === undefined) {
      config[key] = value;
      fixed(`Missing "${key}" filled with default`);
      dirty = true;
    }
  }
  const profiles = config.profiles as Record<string, string>;
  for (const dir of ["prompt", "response", "tool"] as const) {
    if (!profiles[dir]) {
      profiles[dir] = CONFIG_TEMPLATE.profiles[dir];
      fixed(`Missing profiles.${dir} filled with env-var reference`);
      dirty = true;
    }
  }
  if (dirty) {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  }

  // --- Environment ---
  const apiKeyEnvVar = (config.apiKeyEnvVar as string) || "PRISMA_AIRS_API_KEY";
  if (process.env[apiKeyEnvVar]?.trim()) {
    ok(`API key present in $${apiKeyEnvVar}`);
  } else {
    advise(`Set your API key: export ${apiKeyEnvVar}=<your-x-pan-token>`);
  }
  if (!process.env.PRISMA_AIRS_PROFILE_NAME && JSON.stringify(profiles).includes("${")) {
    advise("Profiles use env-var references — set PRISMA_AIRS_PROFILE_NAME (or the per-direction vars)");
  }

  // --- Full load + log directory ---
  try {
    const loaded = loadConfig(configPath);
    ok(`Config loads cleanly (mode=${loaded.mode}, endpoint=${loaded.endpoint})`);
    const logDir = dirname(loaded.logging.path);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
      fixed(`Created log directory ${logDir}`);
    }
  } catch (err) {
    advise(`Config still fails to load: ${err instanceof Error ? err.message : err}`);
  }

  // --- Hook registration + build ---
  const hooksJson = join(homedir(), ".cursor", "hooks.json");
  if (existsSync(hooksJson)) {
    const raw = readFileSync(hooksJson, "utf-8");
    if (raw.includes("before-submit-prompt")) {
      ok(`Hooks registered in ${hooksJson}`);
      const m = raw.match(/"node \\?"?([^"\\]+dist)/);
      const distDir = m?.[1];
      if (distDir && !existsSync(join(distDir, "hooks", "before-submit-prompt.js"))) {
        advise(`Hooks point at ${distDir} but compiled files are missing — run: npm run build`);
      }
    } else {
      advise("hooks.json exists but has no AIRS entries — run: prisma-airs-hooks install --global");
    }
  } else {
    advise("No ~/.cursor/hooks.json — run: prisma-airs-hooks install --global");
  }

  // --- Summary ---
  console.log("");
  if (repaired) console.log(`🔧 Applied ${repaired} repair(s)`);
  if (advised) {
    console.log(`👉 ${advised} action(s) need you — see above`);
    process.exit(1);
  }
  console.log("✅ Everything checks out");
}

main();
