#!/usr/bin/env tsx
/**
 * Sends a benign prompt to AIRS and prints the result.
 * Run: npx tsx scripts/validate-connection.ts
 */
import { init, Scanner, Content } from "@cdot65/prisma-airs-sdk";
import { loadConfig, getApiKey } from "../src/config.js";

async function main() {
  console.log("Validating AIRS API connectivity...\n");

  const config = loadConfig();
  init({
    apiKey: getApiKey(config),
    apiEndpoint: config.endpoint,
  });

  const scanner = new Scanner();
  const content = new Content({
    prompt: "Hello, can you help me write a function to sort an array?",
  });

  const start = Date.now();
  const result = await scanner.syncScan(
    { profile_name: config.profiles.prompt },
    content,
    { metadata: { app_name: "cursor-ide", app_user: "validation-script" } },
  );
  const latencyMs = Date.now() - start;

  console.log(`Endpoint:  ${config.endpoint}`);
  console.log(`Profile:   ${config.profiles.prompt}`);
  console.log(`Latency:   ${latencyMs}ms`);
  console.log(`Scan ID:   ${result.scan_id}`);
  console.log(`Report ID: ${result.report_id}`);
  console.log(`Category:  ${result.category}`);
  console.log(`Action:    ${result.action}`);

  console.log("\n✅ Connection validated successfully");
}

main().catch((err) => {
  console.error("❌ Validation failed:", err.message);
  process.exit(1);
});
