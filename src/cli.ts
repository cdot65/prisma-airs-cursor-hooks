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

const COMMANDS: Record<string, string> = {
  install: "scripts/install-hooks.ts",
  uninstall: "scripts/uninstall-hooks.ts",
  verify: "scripts/verify-hooks.ts",
  "validate-connection": "scripts/validate-connection.ts",
  "validate-detection": "scripts/validate-detection.ts",
  stats: "scripts/airs-stats.ts",
};

function usage(): void {
  console.log(`
Prisma AIRS Cursor Hooks

Usage:
  prisma-airs-hooks install [--global]      Install hooks into Cursor
  prisma-airs-hooks uninstall [--global]    Remove hooks from Cursor
  prisma-airs-hooks verify                  Check hooks registration and env vars
  prisma-airs-hooks validate-connection     Test AIRS API connectivity
  prisma-airs-hooks validate-detection      Verify detection is working
  prisma-airs-hooks stats [--since] [--json] Show scan statistics
`.trim());
}

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

const script = COMMANDS[command];
if (!script) {
  console.error(`Unknown command: ${command}\n`);
  usage();
  process.exit(1);
}

try {
  execSync(`npx tsx "${join(ROOT, script)}" ${passthrough}`, {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });
} catch {
  process.exit(1);
}
