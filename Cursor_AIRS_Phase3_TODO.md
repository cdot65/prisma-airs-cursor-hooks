# Phase 3: Enforcement Mode, Observability, Hardening, and Rollout

**Goal:** Enable enforcement mode (blocking on detection), add production-grade observability, harden error handling, address the centralized deployment gap, and prepare for team-wide rollout.

**Duration estimate:** 2–3 days

**Prerequisite:** Phase 2 exit criteria met (hooks firing correctly in observe mode, code extraction validated, smoke tests passing)

---

## 3.1 Enforcement Mode

- [ ] Implement enforcement logic in both hooks:
  - When AIRS verdict = `block` and mode = `enforce`:
    - **Pre-send hook:** Prevent prompt transmission. Display message to developer:
      ```
      ⛔ Prisma AIRS blocked this prompt.
      Detection: [detection_service_name]
      Reason: [finding detail summary]
      Profile: cursor-ide-prompt-profile

      Modify your prompt and try again. If you believe this is a false positive,
      contact your security team. Scan ID: [scan_id]
      ```
    - **Pre-display hook:** Prevent response display. Display message:
      ```
      ⛔ Prisma AIRS blocked this response.
      Detection: [detection_service_name]
      Reason: [finding detail summary]
      Profile: cursor-ide-response-profile

      The AI agent's response was flagged. Scan ID: [scan_id]
      ```
  - When verdict = `allow`, pass through normally
- [ ] Test enforcement for each detection service:
  - [ ] Prompt injection → prompt blocked
  - [ ] DLP (API key in prompt) → prompt blocked
  - [ ] Malicious code in response → response blocked (verify `code_response` key triggered the detection)
  - [ ] Suspicious URL in response → response blocked
  - [ ] Toxicity in prompt → prompt blocked
  - [ ] Custom topic guardrail violation → prompt blocked
  - [ ] Benign prompt and response → both pass through
- [ ] Implement DLP masking option: when DLP detects sensitive data, optionally mask it (using AIRS masking coordinates) rather than blocking entirely. Make this configurable per detection service:
  ```json
  {
    "enforcement": {
      "prompt_injection": "block",
      "dlp": "mask",
      "malicious_code": "block",
      "url_categorization": "block",
      "toxicity": "block",
      "custom_topic": "block"
    }
  }
  ```
- [ ] Write tests for each enforcement action per detection service

## 3.2 Circuit Breaker

- [ ] Implement circuit breaker in `airs-client.ts`:
  - Track consecutive failure count
  - After `N` consecutive failures (configurable, default 5), enter "open" state:
    - All scans bypass AIRS for a configurable cooldown period (default 60 seconds)
    - Log circuit breaker activation event
  - After cooldown, enter "half-open" state:
    - Send next scan to AIRS as a probe
    - If probe succeeds, reset to "closed" (normal operation)
    - If probe fails, re-enter "open" state
  - Circuit breaker state persisted in memory only (resets on Cursor restart)
- [ ] Log all state transitions: closed→open, open→half-open, half-open→closed, half-open→open
- [ ] Write tests for circuit breaker state machine (failure accumulation, cooldown, probe success/failure)

## 3.3 Enhanced Observability

- [ ] Implement `scripts/airs-stats.ts` CLI command:
  - Reads scan log file and outputs summary:
    ```
    Prisma AIRS Hook Statistics (last 24 hours)
    ─────────────────────────────────────────────
    Total scans:        142
    Prompts scanned:     71
    Responses scanned:   71
    Verdicts:
      Allowed:          138 (97.2%)
      Blocked:            3 (2.1%)
      Observed:           0 (0.0%)
      Errors/Bypassed:    1 (0.7%)
    Detection triggers:
      prompt_injection:   2
      dlp:                1
      malicious_code:     0
    Latency:
      p50:              142ms
      p95:              387ms
      p99:              512ms
    Circuit breaker:    closed
    ```
  - Support `--since` flag for custom time ranges
  - Support `--json` flag for machine-readable output
- [ ] Add `npm run stats` script to `package.json`
- [ ] Implement log rotation: when log file exceeds 10MB, rotate to `.log.1`, `.log.2`, keep last 5
- [ ] Add `scan_direction` field to all log entries for filtering prompt vs response scans

## 3.4 Performance Optimization

- [ ] Profile hook startup time — target under 50ms:
  - Pre-load configuration at first invocation, cache in memory for subsequent calls (if Cursor hooks persist process)
  - If Cursor spawns a new process per hook invocation, consider:
    - Compiled JavaScript bundle (esbuild) to eliminate module resolution overhead
    - Go binary alternative for sub-10ms cold start
- [ ] Measure and log end-to-end latency breakdown:
  - Hook startup time
  - Code extraction time
  - AIRS API call time (network)
  - Verdict processing time
- [ ] If AIRS API latency consistently exceeds 500ms:
  - Evaluate switching to async API (`v1/scan/async/request`) with polling for enforcement, or sync for observe-only
  - Consider prompt-only scanning (skip response scanning) as a degraded mode

## 3.5 Centralized Deployment Strategy

- [ ] Document the enforcement gap: hooks in `.cursor/hooks/` are user-writable and removable
- [ ] Implement tamper detection (best-effort):
  - `scripts/verify-hooks.ts` — checks that hook scripts exist, have expected checksums, and are registered
  - Can be run as a cron job or startup script to alert if hooks are removed/modified
  - Logs tamper events to a separate file for security team review
- [ ] Create distribution package:
  - [ ] `scripts/package-hooks.sh` — bundles hooks + config template + install script into a distributable archive
  - [ ] Include setup instructions for different deployment methods:
    - Manual: developer runs `npm run install-hooks`
    - MDM (Jamf/Intune): push archive + run install script
    - Dotfiles repo: include hooks in team dotfiles, sync on clone
    - Git hooks: post-checkout hook that verifies AIRS hooks are installed
- [ ] Document the agent gateway alternative architecture for organizations that require hard enforcement:
  - Cursor configured to route through an AIRS-integrated proxy
  - Proxy performs all scanning server-side — no client hooks needed
  - Trade-off: requires infrastructure investment but eliminates the removal gap

## 3.6 Multi-IDE Expansion Preparation

- [ ] Abstract the hook interface behind an adapter:
  ```typescript
  interface HookAdapter {
    registerPreSend(handler: (content: string) => Promise<HookResult>): void;
    registerPreDisplay(handler: (content: string) => Promise<HookResult>): void;
  }

  class CursorHookAdapter implements HookAdapter { ... }
  // Future: class ClaudeCodeHookAdapter implements HookAdapter { ... }
  // Future: class CodexHookAdapter implements HookAdapter { ... }
  ```
- [ ] Ensure all Cursor-specific logic is isolated in `CursorHookAdapter`
- [ ] Core scanning logic (`scanner.ts`, `airs-client.ts`, `code-extractor.ts`, `logger.ts`) is IDE-agnostic
- [ ] Document adapter pattern for Claude Code and Codex hooks (do not implement — out of scope)

## 3.7 End-to-End Testing

- [ ] Create an automated test suite using the evaluation prompts from `Prisma_AIRS_Evaluation_Prompts.csv`:
  - Load each prompt from CSV
  - Send through the pre-send hook
  - Verify verdict matches expected classification (TP/TN)
  - Report TPR, TNR, FPR, FNR per detection service
- [ ] Run the full evaluation suite in both observe and enforce modes
- [ ] Document results and any detection service tuning recommendations
- [ ] Performance test: send 100 sequential prompts, measure:
  - Average latency per scan
  - p95 latency
  - Any circuit breaker activations
  - Memory usage of hook process over time

## 3.8 Documentation and Handoff

- [ ] Write `README.md`:
  - Project overview and architecture diagram
  - Quick start (install, configure, validate)
  - Configuration reference
  - Troubleshooting guide
  - Security considerations
- [ ] Write `DEPLOYMENT.md`:
  - Observe mode deployment steps
  - Transition to enforcement mode
  - Centralized distribution options
  - Monitoring and alerting setup
- [ ] Write `CONTRIBUTING.md`:
  - Development setup
  - Adding new detection service handling
  - Adding new IDE adapters
  - Running tests

## 3.9 Phase 3 Exit Criteria

- [ ] Enforcement mode correctly blocks prompts and responses per configured detection service policy
- [ ] DLP masking works as an alternative to blocking for sensitive data findings
- [ ] Circuit breaker activates after consecutive failures and recovers after cooldown
- [ ] `npm run stats` produces accurate summary of scan activity
- [ ] Log rotation prevents unbounded log growth
- [ ] Hook startup + scan latency is under 500ms at p95
- [ ] Tamper detection script identifies removed or modified hooks
- [ ] Distribution package created and tested with at least one deployment method
- [ ] Evaluation prompt suite achieves acceptable TPR/TNR against AIRS
- [ ] All documentation written and reviewed
- [ ] Hook adapter abstraction cleanly separates Cursor-specific logic from core scanning
