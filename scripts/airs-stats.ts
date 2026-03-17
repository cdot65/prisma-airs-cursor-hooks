#!/usr/bin/env tsx
/**
 * Display scan statistics from the AIRS log file.
 * Run: npx tsx scripts/airs-stats.ts [--since 24h] [--json]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface LogEntry {
  timestamp: string;
  event: string;
  scan_id?: string;
  direction?: string;
  verdict?: string;
  action_taken?: string;
  latency_ms?: number;
  detection_services_triggered?: string[];
  error?: string | null;
}

function parseSince(arg: string): number {
  const match = arg.match(/^(\d+)(h|d|m)$/);
  if (!match) return 24 * 60 * 60 * 1000; // default 24h
  const val = parseInt(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return val * (multipliers[unit] ?? 3_600_000);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const sinceIdx = args.indexOf("--since");
  const sinceMs = sinceIdx >= 0 ? parseSince(args[sinceIdx + 1]) : 24 * 60 * 60 * 1000;

  const logPath = resolve(process.cwd(), ".cursor", "hooks", "airs-scan.log");
  if (!existsSync(logPath)) {
    console.log("No log file found at", logPath);
    process.exit(0);
  }

  const cutoff = new Date(Date.now() - sinceMs).toISOString();
  const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
  const entries: LogEntry[] = lines
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e): e is LogEntry => e !== null && e.timestamp >= cutoff);

  const scans = entries.filter((e) => e.event === "scan_complete");
  const prompts = scans.filter((e) => e.direction === "prompt");
  const responses = scans.filter((e) => e.direction === "response");

  const allowed = scans.filter((e) => e.action_taken === "allowed" || e.action_taken === "observed").length;
  const blocked = scans.filter((e) => e.action_taken === "blocked").length;
  const observed = scans.filter((e) => e.action_taken === "observed").length;
  const errors = scans.filter((e) => e.action_taken === "error" || e.action_taken === "bypassed").length;

  const detections: Record<string, number> = {};
  for (const s of scans) {
    for (const d of s.detection_services_triggered ?? []) {
      detections[d] = (detections[d] ?? 0) + 1;
    }
  }

  const latencies = scans.map((s) => s.latency_ms ?? 0).sort((a, b) => a - b);

  const stats = {
    total: scans.length,
    prompts: prompts.length,
    responses: responses.length,
    allowed,
    blocked,
    observed,
    errors,
    detections,
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
  };

  if (jsonOutput) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const pct = (n: number) => scans.length > 0 ? ((n / scans.length) * 100).toFixed(1) : "0.0";

  console.log(`Prisma AIRS Hook Statistics`);
  console.log(`${"─".repeat(45)}`);
  console.log(`Total scans:        ${stats.total}`);
  console.log(`Prompts scanned:    ${stats.prompts}`);
  console.log(`Responses scanned:  ${stats.responses}`);
  console.log(`Verdicts:`);
  console.log(`  Allowed:          ${stats.allowed} (${pct(stats.allowed)}%)`);
  console.log(`  Blocked:          ${stats.blocked} (${pct(stats.blocked)}%)`);
  console.log(`  Observed:         ${stats.observed} (${pct(stats.observed)}%)`);
  console.log(`  Errors/Bypassed:  ${stats.errors} (${pct(stats.errors)}%)`);

  if (Object.keys(detections).length > 0) {
    console.log(`Detection triggers:`);
    for (const [service, count] of Object.entries(detections)) {
      console.log(`  ${service}: ${count}`);
    }
  }

  console.log(`Latency:`);
  console.log(`  p50:              ${stats.latency.p50}ms`);
  console.log(`  p95:              ${stats.latency.p95}ms`);
  console.log(`  p99:              ${stats.latency.p99}ms`);
}

main();
