# Phase 1: Project Scaffolding, Configuration, and AIRS API Connectivity

**Goal:** Stand up the project structure, establish authenticated connectivity to the Prisma AIRS API, and validate a single end-to-end scan from a standalone script before touching Cursor hooks.

**Duration estimate:** 1–2 days

---

## 1.1 Project Initialization

- [ ] Create project directory structure:
  ```
  cursor-airs-hooks/
  ├── src/
  │   ├── config.ts          # Configuration loader
  │   ├── airs-client.ts     # AIRS API client
  │   ├── scanner.ts         # Scan orchestration (prompt vs response)
  │   ├── code-extractor.ts  # Separate code blocks from natural language
  │   ├── logger.ts          # Structured JSON logger
  │   ├── hooks/
  │   │   ├── pre-send.ts    # Prompt hook entry point
  │   │   └── pre-display.ts # Response hook entry point
  │   └── types.ts           # TypeScript interfaces
  ├── test/
  │   ├── airs-client.test.ts
  │   ├── code-extractor.test.ts
  │   └── scanner.test.ts
  ├── .env.example
  ├── airs-config.json       # Default configuration template
  ├── package.json
  └── tsconfig.json
  ```
- [ ] Initialize `package.json` with TypeScript, `tsx` (for direct TS execution), and `vitest` (for testing)
- [ ] Create `tsconfig.json` targeting ES2022 with strict mode enabled
- [ ] Create `.env.example` documenting required environment variables:
  ```
  AIRS_API_KEY=<your-x-pan-token>
  AIRS_API_ENDPOINT=https://<region>.api.prismacloud.io
  ```

## 1.2 Configuration Module

- [ ] Implement `config.ts` — loads and validates `airs-config.json`:
  ```json
  {
    "endpoint": "${AIRS_API_ENDPOINT}",
    "apiKeyEnvVar": "AIRS_API_KEY",
    "profiles": {
      "prompt": "cursor-ide-prompt-profile",
      "response": "cursor-ide-response-profile"
    },
    "mode": "observe",
    "timeout_ms": 3000,
    "retry": {
      "enabled": true,
      "max_attempts": 1,
      "backoff_base_ms": 200
    },
    "logging": {
      "path": ".cursor/hooks/airs-scan.log",
      "include_content": false
    }
  }
  ```
- [ ] Validate that `mode` is one of `observe` | `enforce` | `bypass`
- [ ] Validate that the API key environment variable is set and non-empty
- [ ] Validate endpoint URL format
- [ ] Write unit tests for config validation (missing key, invalid mode, malformed URL)

## 1.3 AIRS API Client

- [ ] Implement `airs-client.ts` with the following interface:
  ```typescript
  interface ScanRequest {
    tr_id: string;
    scan_id: string;
    ai_profile: string;
    metadata: { app_name: string; app_user: string };
    contents: Array<{ prompt?: string; response?: string; code_response?: string }>;
  }

  interface ScanResult {
    action: "allow" | "block";
    scan_id: string;
    report_id: string;
    profile_name: string;
    findings?: Array<{
      detection_service: string;
      verdict: string;
      detail: string;
    }>;
  }

  async function scanSync(request: ScanRequest): Promise<ScanResult>;
  ```
- [ ] Use native `fetch` (Node 18+) — no external HTTP dependency
- [ ] Set `x-pan-token` header from environment variable
- [ ] Set `Content-Type: application/json`
- [ ] Implement timeout via `AbortController` with configurable duration
- [ ] Implement single-retry with exponential backoff on 5xx responses
- [ ] On timeout or network error, return a synthetic "allow" result (fail-open) and log the error
- [ ] Generate `tr_id` and `scan_id` using `crypto.randomUUID()`
- [ ] Write unit tests with mocked fetch: success path, 5xx retry, timeout fail-open, auth failure

## 1.4 Structured Logger

- [ ] Implement `logger.ts` — append-only JSON lines to configurable log file
- [ ] Log schema per entry:
  ```json
  {
    "timestamp": "2026-03-16T14:30:00.000Z",
    "event": "scan_complete",
    "scan_id": "uuid",
    "direction": "prompt" | "response",
    "verdict": "allow" | "block",
    "action_taken": "allowed" | "blocked" | "observed",
    "latency_ms": 187,
    "detection_services_triggered": ["prompt_injection"],
    "error": null
  }
  ```
- [ ] Conditional content logging: only include prompt/response text when `include_content: true` (debug mode)
- [ ] Handle file write errors gracefully (never crash the hook)
- [ ] Write tests for log format and content redaction

## 1.5 Standalone Validation Script

- [ ] Create `scripts/validate-connection.ts` — sends a hardcoded benign prompt to AIRS and prints the result
- [ ] Create `scripts/validate-detection.ts` — sends a known prompt injection ("ignore all previous instructions...") and confirms AIRS returns a block verdict
- [ ] Both scripts should output: HTTP status, latency, verdict, and any findings
- [ ] Document in README: "Run these scripts first to confirm your AIRS API key and profiles are working"

## 1.6 Phase 1 Exit Criteria

- [ ] `npm test` passes with all unit tests green
- [ ] `validate-connection.ts` returns a successful scan result from the AIRS API
- [ ] `validate-detection.ts` confirms prompt injection is detected and blocked
- [ ] Configuration loads correctly from `airs-config.json` with environment variable substitution
- [ ] Logger writes structured JSON to the configured log path
- [ ] No secrets appear in any committed file (API key only via env var)
