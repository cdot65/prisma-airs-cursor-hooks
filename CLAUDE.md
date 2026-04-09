# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cursor IDE hooks integrating Prisma AIRS (AI Runtime Security) into the developer workflow. Scans prompts (beforeSubmitPrompt, **can block**), MCP tool inputs (beforeMCPExecution, **can block**), tool outputs (postToolUse, **observe-only**), and responses (afterAgentResponse, **observe-only — cannot block**) via Cursor's hook system against the Prisma AIRS Sync API for prompt injection, malicious code, DLP violations, and toxicity.

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
                   MCP Tool Call → beforeMCPExecution hook → AIRS Sync API (tool_event scan) → allow/block
                                                  ↓
                   Tool Output → postToolUse hook → AIRS Sync API → log/warn (observe-only)
                                                  ↓
AI response → afterAgentResponse hook → code extractor → AIRS Sync API (response + code_response scan) → log/warn (observe-only)
```

### Hook Contracts

- **beforeSubmitPrompt** (can block): stdin `{ prompt, user_email }` → stdout `{ continue: true/false, user_message? }`
- **beforeMCPExecution** (can block): stdin `{ tool_name, tool_input, ... }` → stdout `{ continue: true/false, user_message? }`
- **postToolUse** (observe-only): stdin `{ tool_name, tool_input, tool_output, ... }` → stdout ignored by Cursor. Scans tool output and logs violations.
- **afterAgentResponse** (observe-only): stdin `{ text }` → stdout ignored by Cursor. Scans and logs violations but **cannot block or hide** the response — Cursor displays it before the hook fires. Violations are surfaced as warnings in the Hooks output panel.

### Core Modules

| Module | Purpose |
|---|---|
| `src/config.ts` | Load/validate airs-config.json (project → global fallback) |
| `src/airs-client.ts` | SDK wrapper with circuit breaker |
| `src/logger.ts` | Structured JSON Lines logging with rotation |
| `src/types.ts` | TypeScript interfaces |
| `src/hooks/before-submit-prompt.ts` | Cursor beforeSubmitPrompt entry point |
| `src/hooks/before-mcp-execution.ts` | Cursor beforeMCPExecution entry point (can block) |
| `src/hooks/post-tool-use.ts` | Cursor postToolUse entry point (observe-only) |
| `src/hooks/after-agent-response.ts` | Cursor afterAgentResponse entry point (observe-only, cannot block) |
| `src/code-extractor.ts` | Separates fenced/indented code blocks from natural language |
| `src/scanner.ts` | Orchestrates prompt vs response scanning + DLP masking |
| `src/tool-name-parser.ts` | Parse MCP:server:tool format |
| `src/content-limits.ts` | Configurable skip/truncate before scanning |
| `src/circuit-breaker.ts` | Failure tracking with cooldown bypass |
| `src/cli.ts` | CLI entry point (`prisma-airs-hooks` command) |

### Key Design Decisions

- **Fail-open**: if AIRS unreachable, never block developer
- **Three modes**: `observe` (log only), `enforce` (block on detection), `bypass` (skip)
- **Separate AIRS profiles**: different security policies for prompts, responses, and tools (`profiles.prompt`, `profiles.response`, `profiles.tool`)
- **Response scanning splits content**: natural language in `response` field, extracted code in `code_response` field
- **Tool scanning uses `tool_event`**: MCP tool inputs/outputs sent as `tool_event` content type
- **postToolUse routing by tool name**: MCP:* → tool_event, Bash → response, Write/Edit → prompt (DLP)
- **Configurable content limits**: `content_limits.max_scan_bytes` (skip threshold, default 50KB), `content_limits.truncate_bytes` (truncation, default 20KB)
- **Precompiled JS**: hooks use `node dist/` for ~800ms latency vs ~2.5s with tsx
- **Circuit breaker**: after N consecutive failures, temporarily bypass with periodic retry

### AIRS API

- **Endpoint:** `POST https://service.api.aisecurity.paloaltonetworks.com/v1/scan/sync/request`
- **Auth:** `x-pan-token` header from `PRISMA_AIRS_API_KEY` env var
- **Prompt scan content:** `{ "prompt": "<text>" }`
- **Response scan content:** `{ "response": "<natural-lang>", "code_response": "<code>" }`
- **Tool scan content:** `{ "tool_event": "<tool-input-or-output>" }`

### Configuration

Config lives at `.cursor/hooks/airs-config.json` or `~/.cursor/hooks/airs-config.json`. Environment variables:
- `PRISMA_AIRS_API_KEY` — x-pan-token for AIRS API (required)
- `PRISMA_AIRS_API_ENDPOINT` — regional API base URL (optional, defaults to US)
- `PRISMA_AIRS_PROMPT_PROFILE` — prompt security profile name (optional)
- `PRISMA_AIRS_RESPONSE_PROFILE` — response security profile name (optional)
- `PRISMA_AIRS_TOOL_PROFILE` — tool/MCP security profile name (optional)
