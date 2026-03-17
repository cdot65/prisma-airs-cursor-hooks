# Overview

Prisma AIRS Cursor Hooks integrate [Prisma AIRS](https://www.paloaltonetworks.com/prisma/ai-runtime-security) scanning into the [Cursor IDE](https://cursor.sh) developer workflow. The hooks intercept:

- **Prompts** (pre-send) — before they're sent to the AI agent
- **Responses** (pre-display) — before they're shown to the developer

Each intercepted message is scanned via the AIRS Sync API against configurable security profiles.

## How It Works

```
Developer prompt → pre-send hook → AIRS API (prompt scan) → allow/block
                                        ↓
                  Cursor AI Agent processes prompt (if allowed)
                                        ↓
AI response → pre-display hook → code extractor → AIRS API (response + code scan) → allow/block
```

## Modes

| Mode | Behavior |
|------|----------|
| `observe` | Log scan results, never block (default) |
| `enforce` | Block prompts/responses that AIRS flags |
| `bypass` | Skip scanning entirely |

## Key Features

- **SDK-powered** — Uses `@cdot65/prisma-airs-sdk` for API communication
- **Fail-open** — Network errors never block the developer
- **Code extraction** — Separates code from natural language for proper `code_response` scanning
- **Circuit breaker** — After consecutive failures, temporarily bypasses scanning
- **DLP masking** — Optionally mask sensitive data instead of blocking
- **Structured logging** — JSON Lines format for downstream ingestion
