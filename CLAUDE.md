# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cursor IDE hooks integrating Prisma AIRS (AI-powered attack surface scanning) into the developer workflow. Intercepts prompts (pre-send) and responses (pre-display) via Cursor's hook system, scanning them against the Prisma AIRS Sync API for prompt injection, malicious code, DLP violations, and toxicity.

**Status:** Greenfield — PRD and phased TODO lists exist, no source code yet.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 18+ (native fetch, crypto.randomUUID)
- **Executor:** tsx (no build step)
- **Test framework:** vitest
- **Package manager:** npm
- **No external HTTP library** — uses native fetch

## Commands

```bash
# install deps
npm install

# run all tests
npx vitest run

# run single test
npx vitest run test/airs-client.test.ts

# run tests in watch mode
npx vitest

# execute a hook directly (for manual testing)
npx tsx src/hooks/pre-send.ts

# validate AIRS connectivity
npx tsx scripts/validate-connection.ts

# validate detection
npx tsx scripts/validate-detection.ts
```

## Architecture

```
Developer prompt → pre-send hook → AIRS Sync API (prompt scan) → allow/block
                                        ↓
Cursor AI Agent processes prompt (if allowed)
                                        ↓
AI response → pre-display hook → code extractor → AIRS Sync API (response + code_response scan) → allow/block
```

### Core Modules

| Module | Purpose |
|---|---|
| `src/config.ts` | Load/validate `.cursor/hooks/airs-config.json` |
| `src/airs-client.ts` | HTTP client for AIRS Sync API (`POST /v1/scan/sync/request`) |
| `src/logger.ts` | Structured JSON Lines logging to `.cursor/hooks/airs-scan.log` |
| `src/types.ts` | TypeScript interfaces for API req/res |
| `src/hooks/pre-send.ts` | Prompt interception hook |
| `src/hooks/pre-display.ts` | Response interception hook |
| `src/code-extractor.ts` | Separates fenced/indented code blocks from natural language |
| `src/scanner.ts` | Orchestrates prompt vs response scanning |

### Key Design Decisions

- **Fail-open**: if AIRS unreachable, never block developer
- **Three modes**: `observe` (log only), `enforce` (block on detection), `bypass` (skip)
- **Separate AIRS profiles**: different security policies for prompts vs responses
- **Response scanning splits content**: natural language in `response` field, extracted code in `code_response` field
- **Circuit breaker** (Phase 3): after N consecutive failures, temporarily bypass with periodic retry

### AIRS API

- **Endpoint:** `POST https://<region>.api.prismacloud.io/v1/scan/sync/request`
- **Auth:** `x-pan-token` header from `AIRS_API_KEY` env var
- **Prompt scan content:** `{ "prompt": "<text>" }`
- **Response scan content:** `{ "response": "<natural-lang>", "code_response": "<code>" }`

### Configuration

Config lives at `.cursor/hooks/airs-config.json`. Environment variables:
- `AIRS_API_KEY` — x-pan-token for AIRS API
- `AIRS_API_ENDPOINT` — regional API base URL

## Implementation Phases

- **Phase 1:** Project scaffolding, config loader, AIRS client, logger, validation scripts
- **Phase 2:** Hook integration, code extraction, observe mode, smoke tests
- **Phase 3:** Enforce mode, circuit breaker, DLP masking, stats CLI, tamper detection
