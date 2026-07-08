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

/**
 * A scan request, discriminated by direction. The direction selects both the
 * AIRS content shape and the security profile (config.profiles[direction]).
 */
export type ScanRequest =
  | { direction: "prompt"; prompt: string }
  | { direction: "response"; response: string; codeResponse?: string }
  | {
      direction: "tool";
      serverName: string;
      toolInvoked: string;
      input?: string;
      output?: string;
    };

/** Build a session ID from user email + UTC date (e.g. "alice@co.com:2026-04-09") */
function buildSessionId(appUser: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${appUser}:${date}`;
}

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

/** Build the SDK Content payload for a scan request */
function buildContent(request: ScanRequest): Content {
  switch (request.direction) {
    case "prompt":
      return new Content({ prompt: request.prompt });
    case "response": {
      const opts: Record<string, string> = { response: request.response };
      if (request.codeResponse) opts.codeResponse = request.codeResponse;
      return new Content(opts);
    }
    case "tool": {
      const toolEvent: Record<string, unknown> = {
        metadata: {
          ecosystem: "mcp",
          method: "tools/call",
          server_name: request.serverName,
          tool_invoked: request.toolInvoked,
        },
      };
      if (request.input !== undefined) toolEvent.input = request.input;
      if (request.output !== undefined) toolEvent.output = request.output;
      return new Content({ toolEvent });
    }
  }
}

/**
 * Execute a scan against the AIRS Sync API.
 *
 * Owns everything transport-related: SDK init, circuit breaker, profile
 * selection by direction, session binding, and latency measurement.
 * Fails open (synthetic allow) when the circuit breaker is open;
 * propagates SDK errors otherwise.
 */
export async function executeScan(
  config: AirsConfig,
  request: ScanRequest,
  appUser: string,
  logger?: Logger,
): Promise<{ result: ScanResponse; latencyMs: number }> {
  ensureInit(config, logger);

  if (breaker && !breaker.shouldAllow()) {
    logger?.logEvent("scan_bypassed_circuit_open", { direction: request.direction });
    return { result: circuitOpenResult(), latencyMs: 0 };
  }

  const scanner = new Scanner();
  const content = buildContent(request);

  const start = Date.now();
  try {
    const result = await scanner.syncScan(
      { profile_name: config.profiles[request.direction] },
      content,
      { sessionId: buildSessionId(appUser), metadata: { app_name: "cursor-ide", app_user: appUser } },
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
