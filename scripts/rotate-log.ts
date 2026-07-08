#!/usr/bin/env tsx
/**
 * Rotate the AIRS scan log immediately (log → log.1 → … → log.5).
 * Run: npx tsx scripts/rotate-log.ts
 */
import { existsSync, statSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { forceRotate } from "../src/log-rotation.js";
import { defaultLogPath } from "./lib/paths.js";

function main() {
  let logPath: string;
  try {
    logPath = loadConfig().logging.path;
  } catch {
    logPath = defaultLogPath();
  }

  if (!existsSync(logPath)) {
    console.log(`Nothing to rotate — no log file at ${logPath}`);
    return;
  }

  const sizeKb = Math.round(statSync(logPath).size / 1024);
  forceRotate(logPath);
  console.log(`✅ Rotated ${logPath} (${sizeKb} KB) → ${logPath}.1`);
}

main();
