#!/usr/bin/env tsx
/**
 * Sends a benign prompt to AIRS and prints the result.
 * Run: npx tsx scripts/validate-connection.ts
 */
import { executeScan } from "../src/airs-client.js";
import { loadConfig } from "../src/config.js";

async function main() {
  console.log("Validating AIRS API connectivity...\n");

  const config = loadConfig();
  const { result, latencyMs } = await executeScan(
    config,
    { direction: "prompt", prompt: "Hello, can you help me write a function to sort an array?" },
    "validation-script",
  );

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
