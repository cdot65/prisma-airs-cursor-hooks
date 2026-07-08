#!/usr/bin/env node
/**
 * CLI entry point for prisma-airs-cursor-hooks.
 *
 * Usage:
 *   prisma-airs-hooks install [--global]
 *   prisma-airs-hooks uninstall [--global]
 *   prisma-airs-hooks verify
 *   prisma-airs-hooks validate-connection
 *   prisma-airs-hooks validate-detection
 *   prisma-airs-hooks stats [--since <duration>] [--json]
 */

import { execSync } from "node:child_process";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const command = args[0];
const passthrough = args.slice(1).join(" ");

const COMMANDS: Record<string, { script: string; usage: string; help: string }> = {
  install: { script: "scripts/install-hooks.ts", usage: "install [--global]", help: "Install hooks into Cursor" },
  uninstall: { script: "scripts/uninstall-hooks.ts", usage: "uninstall [--global]", help: "Remove hooks from Cursor" },
  verify: { script: "scripts/verify-hooks.ts", usage: "verify", help: "Check hooks registration and env vars" },
  "validate-connection": { script: "scripts/validate-connection.ts", usage: "validate-connection", help: "Test AIRS API connectivity" },
  "validate-detection": { script: "scripts/validate-detection.ts", usage: "validate-detection", help: "Verify detection is working" },
  stats: { script: "scripts/airs-stats.ts", usage: "stats [--since] [--json]", help: "Show scan statistics" },
  logs: { script: "scripts/airs-logs.ts", usage: "logs [--n 10] [--json]", help: "Show recent scan log entries" },
  "rotate-log": { script: "scripts/rotate-log.ts", usage: "rotate-log", help: "Rotate the scan log now" },
  "validate-config": { script: "scripts/validate-config.ts", usage: "validate-config", help: "Validate the AIRS configuration" },
  doctor: { script: "scripts/doctor.ts", usage: "doctor", help: "Diagnose and repair the installation" },
};

function usage(): void {
  const lines = Object.values(COMMANDS).map(
    (c) => `  prisma-airs-hooks ${c.usage.padEnd(27)}${c.help}`,
  );
  console.log(["Prisma AIRS Cursor Hooks", "", "Usage:", ...lines].join("\n"));
}

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

const entry = COMMANDS[command];
if (!entry) {
  console.error(`Unknown command: ${command}\n`);
  usage();
  process.exit(1);
}

try {
  execSync(`npx tsx "${join(ROOT, entry.script)}" ${passthrough}`, {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });
} catch {
  process.exit(1);
}
