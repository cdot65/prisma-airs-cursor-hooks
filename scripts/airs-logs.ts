#!/usr/bin/env tsx
/**
 * Show the most recent entries from the AIRS scan log.
 * Run: npx tsx scripts/airs-logs.ts [--n 10] [--json]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolveLogPath } from "./lib/paths.js";

interface LogEntry {
  timestamp?: string;
  event?: string;
  direction?: string;
  verdict?: string;
  action_taken?: string;
  latency_ms?: number;
  detection_services_triggered?: string[];
  scan_id?: string;
  error?: string | null;
  [key: string]: unknown;
}

function formatEntry(e: LogEntry): string {
  const ts = e.timestamp ?? "????-??-??T??:??:??";
  const event = e.event ?? "unknown";

  if (event === "scan_complete") {
    const detections = e.detection_services_triggered?.length
      ? ` detections=[${e.detection_services_triggered.join(", ")}]`
      : "";
    return `${ts}  scan_complete  ${e.direction}  ${e.verdict} → ${e.action_taken}  ${e.latency_ms}ms${detections}`;
  }
  if (event === "scan_error") {
    return `${ts}  scan_error     ${e.direction}  ${e.error}`;
  }

  const extras = Object.entries(e)
    .filter(([k]) => k !== "timestamp" && k !== "event")
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return `${ts}  ${event}${extras ? "  " + extras : ""}`;
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const nIdx = args.indexOf("--n");
  const count = nIdx >= 0 ? Math.max(1, parseInt(args[nIdx + 1]) || 10) : 10;

  const logPath = resolveLogPath();
  if (!existsSync(logPath)) {
    console.log(`No log file found at ${logPath}`);
    process.exit(0);
  }

  const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
  const tail = lines.slice(-count);

  if (jsonOutput) {
    console.log(tail.join("\n"));
    return;
  }

  console.log(`Last ${tail.length} of ${lines.length} entries — ${logPath}\n`);
  for (const line of tail) {
    try {
      console.log(formatEntry(JSON.parse(line)));
    } catch {
      console.log(`(unparseable) ${line}`);
    }
  }
}

main();
