import {
  init,
  Scanner,
  Content,
  AISecSDKException,
  type ScanResponse,
} from "@cdot65/prisma-airs-sdk";
import type { AirsConfig } from "./types.js";
import { getApiKey } from "./config.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { Logger } from "./logger.js";

let initialized = false;

/** Module-level circuit breaker — persists across scans within a process */
let breaker: CircuitBreaker | null = null;

/** Initialize the SDK from our hook config */
function ensureInit(config: AirsConfig, logger?: Logger): void {
  if (!initialized) {
    const apiKey = getApiKey(config);
    init({
      apiKey,
      apiEndpoint: config.endpoint,
      numRetries: config.retry.enabled ? config.retry.max_attempts : 0,
    });
    initialized = true;
  }

  if (!breaker && config.circuit_breaker?.enabled) {
    breaker = new CircuitBreaker(
      {
        failureThreshold: config.circuit_breaker.failure_threshold,
        cooldownMs: config.circuit_breaker.cooldown_ms,
      },
      (from, to) => {
        logger?.logEvent("circuit_breaker_transition", { from, to });
      },
    );
  }
}

/** Reset init state (for testing) */
export function resetInit(): void {
  initialized = false;
  breaker = null;
}

/** Get the current circuit breaker (exposed for stats/diagnostics) */
export function getCircuitBreaker(): CircuitBreaker | null {
  return breaker;
}

/** Synthetic fail-open result when circuit breaker is open */
function circuitOpenResult(): ScanResponse {
  return {
    action: "allow",
    scan_id: "",
    report_id: "",
    category: "bypassed",
  } as unknown as ScanResponse;
}

/** Scan a prompt via AIRS Sync API using the SDK */
export async function scanPromptContent(
  config: AirsConfig,
  prompt: string,
  appUser: string,
  logger?: Logger,
): Promise<{ result: ScanResponse; latencyMs: number }> {
  ensureInit(config, logger);

  // Circuit breaker check — bypass scan if open
  if (breaker && !breaker.shouldAllow()) {
    logger?.logEvent("scan_bypassed_circuit_open", { direction: "prompt" });
    return { result: circuitOpenResult(), latencyMs: 0 };
  }

  const scanner = new Scanner();
  const content = new Content({ prompt });

  const start = Date.now();
  try {
    const result = await scanner.syncScan(
      { profile_name: config.profiles.prompt },
      content,
      { metadata: { app_name: "cursor-ide", app_user: appUser } },
    );
    const latencyMs = Date.now() - start;
    breaker?.recordSuccess();
    return { result, latencyMs };
  } catch (err) {
    breaker?.recordFailure();
    throw err;
  }
}

/** Scan a response (with optional code) via AIRS Sync API using the SDK */
export async function scanResponseContent(
  config: AirsConfig,
  response: string,
  codeResponse: string | undefined,
  appUser: string,
  logger?: Logger,
): Promise<{ result: ScanResponse; latencyMs: number }> {
  ensureInit(config, logger);

  if (breaker && !breaker.shouldAllow()) {
    logger?.logEvent("scan_bypassed_circuit_open", { direction: "response" });
    return { result: circuitOpenResult(), latencyMs: 0 };
  }

  const scanner = new Scanner();
  const contentOpts: Record<string, string> = { response };
  if (codeResponse) {
    contentOpts.codeResponse = codeResponse;
  }
  const content = new Content(contentOpts);

  const start = Date.now();
  try {
    const result = await scanner.syncScan(
      { profile_name: config.profiles.response },
      content,
      { metadata: { app_name: "cursor-ide", app_user: appUser } },
    );
    const latencyMs = Date.now() - start;
    breaker?.recordSuccess();
    return { result, latencyMs };
  } catch (err) {
    breaker?.recordFailure();
    throw err;
  }
}

/** Scan a tool event (MCP input/output) via AIRS Sync API using the SDK */
export async function scanToolEventContent(
  config: AirsConfig,
  serverName: string,
  toolInvoked: string,
  input: string | undefined,
  output: string | undefined,
  appUser: string,
  logger?: Logger,
): Promise<{ result: ScanResponse; latencyMs: number }> {
  ensureInit(config, logger);

  if (breaker && !breaker.shouldAllow()) {
    logger?.logEvent("scan_bypassed_circuit_open", { direction: "tool" });
    return { result: circuitOpenResult(), latencyMs: 0 };
  }

  const scanner = new Scanner();
  const toolEvent: Record<string, unknown> = {
    metadata: {
      ecosystem: "mcp",
      method: "tools/call",
      server_name: serverName,
      tool_invoked: toolInvoked,
    },
  };
  if (input !== undefined) toolEvent.input = input;
  if (output !== undefined) toolEvent.output = output;

  const content = new Content({ toolEvent });

  const start = Date.now();
  try {
    const result = await scanner.syncScan(
      { profile_name: config.profiles.tool },
      content,
      { metadata: { app_name: "cursor-ide", app_user: appUser } },
    );
    const latencyMs = Date.now() - start;
    breaker?.recordSuccess();
    return { result, latencyMs };
  } catch (err) {
    breaker?.recordFailure();
    throw err;
  }
}

export { AISecSDKException };
