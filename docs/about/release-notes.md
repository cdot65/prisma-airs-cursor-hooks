# Release Notes

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
