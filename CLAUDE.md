# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cursor IDE hooks integrating Prisma AIRS (AI Runtime Security) into the developer workflow. Intercepts prompts (beforeSubmitPrompt) and responses (afterAgentResponse) via Cursor's hook system, scanning them against the Prisma AIRS Sync API for prompt injection, malicious code, DLP violations, and toxicity.

Published as `@cdot65/prisma-airs-cursor-hooks` on npm.

## Tech Stack

- **Language:** TypeScript (strict mode, nodenext module resolution)
- **Runtime:** Node.js 18+ (native fetch, crypto.randomUUID)
- **Build:** tsc with tsconfig.build.json → dist/
- **Test framework:** vitest (66 tests, 9 suites)
- **Package manager:** npm
- **Docs:** MkDocs Material
- **CI:** GitHub Actions (typecheck, build, test, docs-build)
- **Publish:** npm OIDC via GitHub Actions on release

## Commands

```bash
# install deps
npm install

# run all tests
npm test

# run single test
npx vitest run test/airs-client.test.ts

# run tests in watch mode
npm run test:watch

# type check
npm run typecheck

# build compiled JS
npm run build

# validate AIRS connectivity
npm run validate-connection

# validate detection
npm run validate-detection

# install hooks globally
npm run install-hooks -- --global

# verify hooks
npm run verify-hooks

# scan stats
npm run stats
```

## Architecture

```
Developer prompt → beforeSubmitPrompt hook → AIRS Sync API (prompt scan) → allow/block
                                                  ↓
                        Cursor AI Agent (if allowed)
                                                  ↓
AI response → afterAgentResponse hook → code extractor → AIRS Sync API (response + code_response scan) → allow/block
```

### Hook Contracts

- **beforeSubmitPrompt**: stdin `{ prompt, user_email }` → stdout `{ continue: true/false, user_message? }`
- **afterAgentResponse**: stdin `{ text }` → stdout `{ permission: "allow"/"deny" }` + exit code 2 on deny

### Core Modules

| Module | Purpose |
|---|---|
| `src/config.ts` | Load/validate airs-config.json (project → global fallback) |
| `src/airs-client.ts` | SDK wrapper with circuit breaker |
| `src/logger.ts` | Structured JSON Lines logging with rotation |
| `src/types.ts` | TypeScript interfaces |
| `src/hooks/before-submit-prompt.ts` | Cursor beforeSubmitPrompt entry point |
| `src/hooks/after-agent-response.ts` | Cursor afterAgentResponse entry point |
| `src/code-extractor.ts` | Separates fenced/indented code blocks from natural language |
| `src/scanner.ts` | Orchestrates prompt vs response scanning + DLP masking |
| `src/circuit-breaker.ts` | Failure tracking with cooldown bypass |
| `src/cli.ts` | CLI entry point (`prisma-airs-hooks` command) |

### Key Design Decisions

- **Fail-open**: if AIRS unreachable, never block developer
- **Three modes**: `observe` (log only), `enforce` (block on detection), `bypass` (skip)
- **Separate AIRS profiles**: different security policies for prompts vs responses
- **Response scanning splits content**: natural language in `response` field, extracted code in `code_response` field
- **Precompiled JS**: hooks use `node dist/` for ~800ms latency vs ~2.5s with tsx
- **Circuit breaker**: after N consecutive failures, temporarily bypass with periodic retry

### AIRS API

- **Endpoint:** `POST https://service.api.aisecurity.paloaltonetworks.com/v1/scan/sync/request`
- **Auth:** `x-pan-token` header from `AIRS_API_KEY` env var
- **Prompt scan content:** `{ "prompt": "<text>" }`
- **Response scan content:** `{ "response": "<natural-lang>", "code_response": "<code>" }`

### Configuration

Config lives at `.cursor/hooks/airs-config.json` or `~/.cursor/hooks/airs-config.json`. Environment variables:
- `AIRS_API_KEY` — x-pan-token for AIRS API (required)
- `AIRS_API_ENDPOINT` — regional API base URL (optional, defaults to US)
- `AIRS_PROMPT_PROFILE` — prompt security profile name (optional)
- `AIRS_RESPONSE_PROFILE` — response security profile name (optional)
