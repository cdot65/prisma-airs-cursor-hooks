# Prisma AIRS Cursor Hooks Integration — Product Requirements Document

## 1. Overview

This PRD defines the requirements for implementing Cursor IDE hooks that integrate Prisma AIRS API scanning into the developer workflow. The integration intercepts prompts before they are sent to the coding agent and responses before they are displayed to the developer, enabling real-time security scanning of all AI-assisted coding interactions.

### 1.1 Problem Statement

Developers using Cursor IDE interact with AI coding agents that generate code, accept natural language instructions, and produce outputs that may contain security risks including prompt injections, sensitive data leakage, malicious code, and policy violations. Today, there is no inline security enforcement layer between the developer and the AI agent within the IDE. Organizations need the ability to scan, detect, and enforce security policies on these interactions without requiring developers to leave their workflow.

### 1.2 Target Users

- **Primary:** Developers using Cursor IDE within an enterprise environment where Prisma AIRS is deployed
- **Secondary:** Security teams responsible for configuring and monitoring AIRS policies
- **Tertiary:** Platform/DevOps teams responsible for distributing and enforcing IDE configurations

### 1.3 Scope

**In Scope:**
- Cursor hooks for pre-send (prompt) and pre-display (response) scanning
- Integration with Prisma AIRS Sync API (`v1/scan/sync/request`)
- Support for `prompt`, `response`, and `code_response` content keys
- Configurable security profiles per scan direction
- Observe-only and enforcement modes
- Local logging and error handling
- Configuration management via `.cursor/hooks/` directory

**Out of Scope:**
- Centralized hook distribution and lockdown enforcement (noted as a critical gap — hooks live in user space and can be removed by the developer)
- Network-layer interception (covered by Prisma AIRS Network Intercept)
- Agent gateway architecture (alternative approach, not hook-based)
- Multi-IDE support beyond Cursor (Claude Code, Codex — similar patterns but separate implementations)

---

## 2. Architecture

### 2.1 Hook Mechanism

Cursor supports a hooks system that allows scripts to execute at defined lifecycle points. The two relevant hook events are:

- **`pre-send`** — Fires before a prompt is transmitted to the AI agent. The hook script receives the prompt content, can modify or block it, and returns either the (possibly modified) prompt or an error that prevents transmission.
- **`pre-display`** — Fires before the agent's response is rendered to the developer. The hook script receives the response content, can modify or block it, and returns either the (possibly modified) response or an error that prevents display.

### 2.2 Scanning Flow

```
Developer types prompt
        │
        ▼
┌─────────────────┐
│  pre-send hook   │──► Prisma AIRS Sync API ──► Scan prompt
│  (prompt scan)   │◄── Verdict + findings   ◄──┘
└────────┬────────┘
         │ (if allowed)
         ▼
   Cursor AI Agent
         │
         ▼
┌─────────────────┐
│ pre-display hook │──► Prisma AIRS Sync API ──► Scan response + code_response
│ (response scan)  │◄── Verdict + findings   ◄──┘
└────────┬────────┘
         │ (if allowed)
         ▼
  Developer sees response
```

### 2.3 API Integration

**Endpoint:** `POST https://<airs-region>.api.prismacloud.io/v1/scan/sync/request`

**Authentication:** API key via `x-pan-token` header

**Prompt Scan Request:**
```json
{
  "tr_id": "<unique-transaction-id>",
  "scan_id": "<unique-scan-id>",
  "ai_profile": "cursor-ide-prompt-profile",
  "metadata": {
    "app_name": "cursor-ide",
    "app_user": "<developer-identity>"
  },
  "contents": [
    {
      "prompt": "<the-developer-prompt>"
    }
  ]
}
```

**Response Scan Request:**
```json
{
  "tr_id": "<unique-transaction-id>",
  "scan_id": "<unique-scan-id>",
  "ai_profile": "cursor-ide-response-profile",
  "metadata": {
    "app_name": "cursor-ide",
    "app_user": "<developer-identity>"
  },
  "contents": [
    {
      "response": "<the-agent-natural-language-response>",
      "code_response": "<the-agent-generated-code>"
    }
  ]
}
```

**Critical: The `code_response` Key**

The `code_response` content key is separate from `prompt` and `response` and MUST be used for any code output from the agent. This key triggers the dedicated Malicious Code Detection service (powered by WildFire static/dynamic analysis and Advanced Threat Prevention inline ML models). Without this key, code is treated as natural language text and will not receive proper malicious code analysis.

Supported languages for `code_response`: JavaScript, Python, VBScript, PowerShell, Batch, Shell, Perl.

### 2.4 Security Profile Design

Two separate AIRS security profiles are recommended:

**`cursor-ide-prompt-profile`** (applied to outbound prompts):
| Detection Service | Rationale |
|---|---|
| Prompt Injection | Core defense — detect jailbreaks, instruction overrides |
| DLP | Catch secrets, API keys, credentials, PII in prompts |
| Custom Topic Guardrails | Enforce organizational policies on conversation topics |
| Toxicity | Prevent abusive or inappropriate prompt content |

**`cursor-ide-response-profile`** (applied to inbound responses):
| Detection Service | Rationale |
|---|---|
| Malicious Code Detection | WildFire + ATP analysis of generated code via `code_response` |
| DLP | Detect sensitive data in responses (model regurgitation) |
| URL Categorization | Flag suspicious/malicious URLs in code comments, docs, imports |
| Prompt Injection | Detect injection attempts in agent responses (indirect injection) |
| Toxicity | Filter inappropriate response content |

---

## 3. Functional Requirements

### 3.1 Core Scanning

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Hook intercepts all prompts before transmission to the Cursor agent | P0 |
| FR-02 | Hook intercepts all agent responses before display to the developer | P0 |
| FR-03 | Prompts are submitted to AIRS Sync API with `prompt` content key | P0 |
| FR-04 | Responses are submitted with `response` key for natural language and `code_response` key for generated code | P0 |
| FR-05 | Hook parses AIRS verdict and enforces configured action (block/allow/observe) | P0 |
| FR-06 | Separate AIRS security profiles are used for prompt vs. response scanning | P0 |
| FR-07 | Code extraction logic correctly separates code blocks from natural language in agent responses | P1 |

### 3.2 Configuration

| ID | Requirement | Priority |
|---|---|---|
| FR-08 | All configuration stored in `.cursor/hooks/airs-config.json` | P0 |
| FR-09 | Configuration includes: AIRS API endpoint, API key reference, profile names, mode (observe/enforce), timeout | P0 |
| FR-10 | API key sourced from environment variable (never hardcoded) | P0 |
| FR-11 | Mode toggle between `observe` (log only, always allow) and `enforce` (block on detection) | P0 |
| FR-12 | Configurable timeout for AIRS API calls with fail-open default | P1 |
| FR-13 | Configurable bypass for local/offline development (no AIRS connectivity) | P2 |

### 3.3 Error Handling

| ID | Requirement | Priority |
|---|---|---|
| FR-14 | API timeout defaults to fail-open (allow the prompt/response through) | P0 |
| FR-15 | Network errors logged locally with structured error detail | P0 |
| FR-16 | Authentication failures surface a clear developer-facing message | P1 |
| FR-17 | Retry logic: single retry with exponential backoff on 5xx errors | P1 |
| FR-18 | Circuit breaker: after N consecutive failures, temporarily bypass scanning with periodic retry | P2 |

### 3.4 Observability

| ID | Requirement | Priority |
|---|---|---|
| FR-19 | Every scan result logged locally with timestamp, scan_id, verdict, action_taken, latency_ms | P0 |
| FR-20 | Log file location configurable, defaults to `.cursor/hooks/airs-scan.log` | P1 |
| FR-21 | Structured JSON log format for downstream ingestion | P1 |
| FR-22 | Summary statistics available via a CLI command (scans today, blocks today, avg latency) | P2 |

### 3.5 Developer Experience

| ID | Requirement | Priority |
|---|---|---|
| FR-23 | Sub-second added latency target for scanning (p95 < 500ms) | P0 |
| FR-24 | When a prompt is blocked, display a clear, actionable message explaining which policy was violated | P1 |
| FR-25 | When a response is blocked, display the violation reason and offer to show the raw (unblocked) response in observe mode | P1 |
| FR-26 | Visual indicator in Cursor status bar showing AIRS scanning status (active/bypassed/error) | P2 |

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Scanning should add less than 500ms latency at p95 for typical prompt/response sizes
- Hook script startup time should be under 50ms (use compiled language or pre-warmed runtime)
- Parallel scanning of code blocks where multiple code_response segments exist

### 4.2 Security
- API keys must never be stored in hook scripts or configuration files in plaintext — use environment variables or a secrets manager reference
- Hook scripts should validate AIRS API TLS certificates
- Local log files should not contain full prompt/response content in production mode (configurable for debug)

### 4.3 Reliability
- Fail-open by default: if AIRS is unreachable, the developer workflow is never blocked
- Graceful degradation: scanning is silently bypassed during outages with local logging
- No data loss: if a scan fails, the original prompt/response passes through unmodified

### 4.4 Deployment Constraints
- Hooks reside in user space (`.cursor/hooks/` directory) and can be removed by the developer
- **This is a known enforcement gap.** For production deployments, this hook-based approach should be paired with one of the following:
  - Centrally-managed configuration distribution (e.g., MDM policy that restores hooks on modification)
  - Network-layer enforcement via Prisma AIRS Network Intercept as a backstop
  - Agent gateway architecture where the IDE connects to a managed proxy rather than directly to the AI provider

---

## 5. Implementation Language and Tooling

**Recommended:** Node.js (TypeScript) or Go

- **Node.js/TypeScript** — Natural fit for the Cursor ecosystem (Electron-based), widely understood by the target developer audience, fast iteration. Use `tsx` for direct TypeScript execution without a build step.
- **Go** — Faster cold start, single binary distribution, no runtime dependency. Better for production-grade hooks where startup latency matters.

**Dependencies:**
- HTTP client (native `fetch` in Node 18+ or `net/http` in Go)
- JSON parser (native)
- File-based logger
- UUID generator for `tr_id` / `scan_id`

---

## 6. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Scan coverage | 100% of prompts and responses intercepted when hooks are active | Local log audit |
| Detection accuracy | Aligned with AIRS platform TPR/TNR benchmarks per detection service | Evaluation prompt test suite |
| Added latency (p50) | < 200ms | Local timing logs |
| Added latency (p95) | < 500ms | Local timing logs |
| Developer opt-out rate | < 5% of developers remove hooks after 30 days | MDM/config audit |
| False positive escalation rate | < 2% of scans result in developer override or complaint | Support ticket tracking |

---

## 7. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Developer removes hooks from `.cursor/hooks/` | Complete bypass of scanning | Pair with network-layer enforcement; MDM policy to restore hooks; agent gateway alternative |
| AIRS API latency spikes degrade developer experience | Developer frustration, potential opt-out | Fail-open timeout, circuit breaker, latency monitoring with alerting |
| `code_response` extraction logic misclassifies code vs. natural language | Malicious code not sent through proper detection pipeline | Conservative extraction: treat ambiguous content as code; test against known code patterns |
| API key compromise | Unauthorized AIRS API usage | Environment variable storage, key rotation policy, scoped API keys per developer or team |
| Cursor hooks API changes in future versions | Hook scripts break silently | Version-pin Cursor, abstract hook interface behind adapter layer, integration tests on Cursor updates |

---

## 8. Open Questions

1. **Cursor hooks API stability:** Is the hooks lifecycle (`pre-send`, `pre-display`) documented as stable, or is it subject to breaking changes? Need to validate against Cursor's current hooks documentation.
2. **Code extraction heuristic:** What is the most reliable method to separate code blocks from natural language in a mixed agent response? Markdown fence detection is the baseline, but agents don't always fence their code.
3. **Multi-file responses:** When Cursor's agent produces changes across multiple files in a single response, should each file's code be scanned as a separate `code_response`, or concatenated into one?
4. **Developer identity propagation:** How should `app_user` be populated? Options include: OS username, Git config email, SSO identity from Cursor's auth, or a configured value.
5. **Centralized enforcement strategy:** Which MDM/endpoint management approach will be used to prevent hook removal? This is the single biggest gap in the hook-based architecture.
