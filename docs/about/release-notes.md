# Release Notes

## 0.2.0

### Breaking Changes

- **Environment variable rename**: All `AIRS_*` variables renamed to `PRISMA_AIRS_*`. See migration guide below.

### New Features

- **`beforeMCPExecution` hook** — scans MCP tool inputs before execution via AIRS `tool_event` content type. Can block tool calls flagged for prompt injection, malicious parameters, etc.
- **`postToolUse` hook** — scans MCP, Shell, Write, and Edit tool outputs for DLP, malicious code, and other violations. Observe-only (audit and logging).
- **Per-direction profiles** — new `profiles.tool` for MCP/tool scanning alongside existing `profiles.prompt` and `profiles.response`.
- **Configurable content limits** — `content_limits.max_scan_bytes` (skip threshold, default 50KB) and `content_limits.truncate_bytes` (truncation, default 20KB) applied to all scan paths.

### Migration

Replace in your shell profile:
- `AIRS_API_KEY` → `PRISMA_AIRS_API_KEY`
- `AIRS_API_ENDPOINT` → `PRISMA_AIRS_API_ENDPOINT`
- `AIRS_PROMPT_PROFILE` → `PRISMA_AIRS_PROMPT_PROFILE`
- `AIRS_RESPONSE_PROFILE` → `PRISMA_AIRS_RESPONSE_PROFILE`
- New: `PRISMA_AIRS_TOOL_PROFILE` (optional)

Then reinstall hooks: `prisma-airs-hooks install --global`

---

## 0.1.0 (2026-03-17)

Initial release.

### Features

- **Prompt scanning** via `beforeSubmitPrompt` Cursor hook
- **Response scanning** via `afterAgentResponse` Cursor hook with code extraction
- **Three modes**: observe, enforce, bypass
- **Six detection services**: prompt injection, DLP, toxicity, malicious code, URL categorization, custom topics
- **Per-service enforcement**: block, mask, or allow independently
- **Fail-open design**: never blocks on infrastructure failures
- **Circuit breaker**: automatic bypass after consecutive API failures
- **DLP masking**: replace sensitive content instead of blocking
- **Code extraction**: fenced, indented, and heuristic detection
- **Structured logging**: JSON Lines with automatic rotation at 10MB
- **Stats CLI**: scan totals, block rates, latency percentiles
- **Global hook installation**: `--global` flag for all Cursor workspaces
- **Precompiled JS**: ~800ms cold start vs ~2.5s with tsx
- **Environment variable defaults**: only `AIRS_API_KEY` required
- **66 tests** across 9 suites including compiled JS integration tests

### Built On

- [`@cdot65/prisma-airs-sdk`](https://github.com/cdot65/prisma-airs-sdk) for AIRS API communication
- TypeScript 5.x with strict mode
- Node.js 18+ (native fetch)
- Vitest for testing
