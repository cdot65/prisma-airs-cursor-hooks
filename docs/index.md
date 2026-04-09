---
title: Home
---

<div class="hero" markdown>

![Prisma AIRS Cursor Hooks](images/logo.svg){ .hero-logo }

# Prisma AIRS Cursor Hooks

**Real-time AI security scanning for the Cursor IDE**

[![npm](https://img.shields.io/npm/v/@cdot65/prisma-airs-cursor-hooks.svg)](https://www.npmjs.com/package/@cdot65/prisma-airs-cursor-hooks)
[![CI](https://github.com/cdot65/prisma-airs-cursor-hooks/actions/workflows/ci.yml/badge.svg)](https://github.com/cdot65/prisma-airs-cursor-hooks/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

</div>

---

Prisma AIRS Cursor Hooks scans prompts and AI responses in the Cursor IDE in real-time via the [Prisma AI Runtime Security (AIRS)](https://www.paloaltonetworks.com/prisma/ai-runtime-security) Sync API. **Blocks** prompts before they reach the LLM and **audits** AI responses for prompt injections, malicious code, sensitive data leakage, toxic content, and policy violations.

---

## Install

```bash
npm install -g @cdot65/prisma-airs-cursor-hooks
```

---

## How It Works

```mermaid
flowchart LR
    A[Developer Prompt] --> B[beforeSubmitPrompt Hook]
    B -->|AIRS Scan| C{Verdict}
    C -->|Allow| D[Cursor AI Agent]
    C -->|Block| E[Block Message]
    D --> F[MCP Tool Call]
    F --> G[beforeMCPExecution Hook]
    G -->|AIRS Scan| H{Verdict}
    H -->|Allow| I[Tool Execution]
    H -->|Block| J[Block Message]
    I --> K[Tool Output]
    K --> L[postToolUse Hook]
    L -->|AIRS Scan| M[Log + Warn]
    D --> N[AI Response]
    N --> O[Display to Developer]
    O --> P[afterAgentResponse Hook]
    P -->|AIRS Scan| Q{Verdict}
    Q -->|Clean| R[No Action]
    Q -->|Violation| S[Log + Warn]
```

!!! warning "postToolUse and afterAgentResponse are observe-only"
    `postToolUse` and `afterAgentResponse` fire **after** content is already processed or displayed. They cannot block or retract content — they scan for audit, compliance, and security alerting. See [Cursor Limitation](reference/cursor-hooks-api.md#cursor-limitation-no-response-blocking).

---

## Capabilities

<div class="grid cards" markdown>

-   :material-shield-search:{ .lg .middle } **Prompt Scanning**

    ---

    Scans every prompt before it reaches the AI agent. Detects prompt injection, DLP violations, toxicity, and custom topic policy violations.

    [:octicons-arrow-right-24: Detection Services](features/detection-services.md)

-   :material-code-braces:{ .lg .middle } **Response & Code Auditing**

    ---

    Parses AI responses to extract code blocks separately. Natural language and code are scanned independently for audit and compliance. Observe-only — [Cursor cannot block responses](reference/cursor-hooks-api.md#cursor-limitation-no-response-blocking).

    [:octicons-arrow-right-24: Code Extraction](features/code-extraction.md)

-   :material-tools:{ .lg .middle } **Tool & MCP Scanning**

    ---

    Scans MCP tool inputs before execution (`beforeMCPExecution`, can block) and tool outputs after execution (`postToolUse`, observe-only). Routes by tool type: MCP → `tool_event`, Bash → `response`, Write/Edit → DLP scan.

    [:octicons-arrow-right-24: Architecture](architecture/scanning-flow.md)

-   :material-shield-lock:{ .lg .middle } **Enforce or Observe**

    ---

    Three modes: `observe` (log only), `enforce` (block on detection), `bypass` (skip). Start in observe mode to audit, switch to enforce when ready.

    [:octicons-arrow-right-24: Configuration](reference/configuration.md)

-   :material-lightning-bolt:{ .lg .middle } **Fail-Open Design**

    ---

    Never blocks the developer on infrastructure failures. Circuit breaker pattern bypasses scanning after consecutive API failures with automatic recovery.

    [:octicons-arrow-right-24: Circuit Breaker](features/circuit-breaker.md)

</div>

---

## Get Started

<div class="grid cards" markdown>

-   :material-download:{ .lg .middle } **Install**

    ---

    Install from npm, set environment variables, and register hooks in Cursor.

    [:octicons-arrow-right-24: Installation](getting-started/installation.md)

-   :material-rocket-launch:{ .lg .middle } **Quick Start**

    ---

    Get scanning in under 5 minutes.

    [:octicons-arrow-right-24: Quick Start](getting-started/quick-start.md)

-   :material-cog:{ .lg .middle } **Configure**

    ---

    Modes, enforcement actions, profiles, circuit breaker, and logging.

    [:octicons-arrow-right-24: Configuration](getting-started/configuration.md)

-   :material-book-open-variant:{ .lg .middle } **Architecture**

    ---

    Scanning flow, module design, and key decisions.

    [:octicons-arrow-right-24: Architecture](architecture/overview.md)

</div>
