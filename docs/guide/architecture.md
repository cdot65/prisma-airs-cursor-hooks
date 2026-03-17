# Architecture

## Cursor Hooks API (v1)

Cursor hooks are configured via `.cursor/hooks.json` at the project root. Hook scripts receive **structured JSON on stdin** and must respond with **JSON on stdout**.

### hooks.json Format

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      {
        "command": "npx tsx src/hooks/before-submit-prompt.ts",
        "timeout": 5000,
        "failClosed": false
      }
    ],
    "afterAgentResponse": [
      {
        "command": "npx tsx src/hooks/after-agent-response.ts",
        "timeout": 5000,
        "failClosed": false
      }
    ]
  }
}
```

### Hook I/O Contract

| Direction | Format | Purpose |
|-----------|--------|---------|
| **stdin** | JSON | Cursor sends event data (`prompt`, `response`, `user_email`, etc.) |
| **stdout** | JSON | Hook replies with `{ permission: "allow"\|"deny", userMessage? }` |
| **stderr** | Text | Debug logs (visible in Cursor's "Hooks" output panel) |
| **Exit 2** | — | Equivalent to `{ permission: "deny" }` |

### Environment Variables

Cursor automatically injects these into hook processes:

| Variable | Description |
|----------|-------------|
| `CURSOR_PROJECT_DIR` | Workspace root path |
| `CURSOR_VERSION` | Cursor application version |
| `CURSOR_USER_EMAIL` | Authenticated user email |
| `CURSOR_TRANSCRIPT_PATH` | Conversation transcript path |

Your shell environment variables (`AIRS_API_KEY`, `AIRS_API_ENDPOINT`) are inherited automatically — no special passthrough needed.

## Scanning Flow

### beforeSubmitPrompt (Prompt Scanning)

```
Developer types prompt
        ↓
Cursor fires beforeSubmitPrompt hook
        ↓
stdin: { "prompt": "...", "user_email": "...", ... }
        ↓
Hook parses JSON → scanner.scanPrompt() → AIRS Sync API
        ↓
stdout: { "permission": "allow" }     ← prompt passes through
   or:  { "permission": "deny",       ← prompt blocked
          "userMessage": "..." }
```

### afterAgentResponse (Response Scanning)

```
AI agent generates response
        ↓
Cursor fires afterAgentResponse hook
        ↓
stdin: { "response": "...", "user_email": "...", ... }
        ↓
Hook parses JSON → code-extractor splits NL/code
        ↓
scanner.scanResponse() → AIRS Sync API
  (response field = natural language, code_response field = extracted code)
        ↓
stdout: { "permission": "allow" }     ← response displayed
   or:  { "permission": "deny",       ← response blocked
          "userMessage": "..." }
```

## Modules

| Module | Purpose |
|--------|---------|
| `src/config.ts` | Load/validate `airs-config.json` (searches `CURSOR_PROJECT_DIR`) |
| `src/airs-client.ts` | Wrapper around `@cdot65/prisma-airs-sdk` |
| `src/scanner.ts` | Orchestrates prompt vs response scanning |
| `src/code-extractor.ts` | Separates code blocks from natural language |
| `src/logger.ts` | Structured JSON Lines logging |
| `src/circuit-breaker.ts` | Failure tracking with cooldown bypass |
| `src/dlp-masking.ts` | Per-service enforcement actions + content masking |
| `src/hooks/before-submit-prompt.ts` | Cursor `beforeSubmitPrompt` entry point |
| `src/hooks/after-agent-response.ts` | Cursor `afterAgentResponse` entry point |
| `src/adapters/` | IDE adapter abstraction for future multi-IDE support |

## Fail-Open Design

- `failClosed: false` in hooks.json — if the hook process crashes, Cursor allows through
- SDK errors and timeouts return `{ permission: "allow" }` — never block the developer
- Config errors return allow with a warning `userMessage`
- Invalid stdin JSON returns allow silently
