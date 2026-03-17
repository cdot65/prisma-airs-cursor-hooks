# Prisma AIRS Cursor Hooks

Cursor IDE hooks that scan prompts and AI responses in real-time using [Prisma AI Runtime Security (AIRS)](https://www.paloaltonetworks.com/prisma/ai-runtime-security). Intercepts prompts before they reach the AI agent and responses before they're displayed, scanning for prompt injections, malicious code, sensitive data leakage, and policy violations.

Built on the [`@cdot65/prisma-airs-sdk`](https://github.com/cdot65/prisma-airs-sdk).

## Architecture

```
Developer prompt → beforeSubmitPrompt hook → AIRS Sync API → allow/block
                                                  ↓
                        Cursor AI Agent (if allowed)
                                                  ↓
AI response → afterAgentResponse hook → code extractor → AIRS Sync API → allow/block
                                         ↓
                        (response field + code_response field)
```

Both hooks use Cursor's native hooks.json system. They receive structured JSON on stdin, scan via the AIRS API, and reply on stdout (`{ "continue": false }` to block prompts, `{ "permission": "deny" }` + exit code 2 to block responses).

## Prerequisites

- **Node.js 18+** (native fetch, crypto.randomUUID)
- **Cursor IDE** (with hooks support)
- **Prisma AIRS API key** and regional endpoint URL
- **AIRS security profiles** configured for prompt and response scanning

## Setup

### Option A: Install from npm (recommended)

```bash
npm install -g @cdot65/prisma-airs-cursor-hooks
```

Then register hooks in Cursor:

```bash
prisma-airs-hooks install --global
```

### Option B: Install from source

```bash
git clone https://github.com/cdot65/prisma-airs-cursor-hooks.git
cd prisma-airs-cursor-hooks
npm install   # also runs `npm run build` via prepare hook
```

### 2. Set environment variables

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export AIRS_API_KEY=<your-x-pan-token>
export AIRS_API_ENDPOINT=https://service.api.aisecurity.paloaltonetworks.com  # optional, defaults to US
export AIRS_PROMPT_PROFILE=cursor-ide-prompt-profile      # optional
export AIRS_RESPONSE_PROFILE=cursor-ide-response-profile  # optional
```

> **Note:** Cursor inherits your shell environment, so hooks automatically have access to these variables. Only `AIRS_API_KEY` is required — endpoint defaults to US and profile names default to `cursor-ide-prompt-profile` / `cursor-ide-response-profile`.

Available regional endpoints:
| Region | Endpoint |
|--------|----------|
| US (default) | `https://service.api.aisecurity.paloaltonetworks.com` |
| EU | `https://service-de.api.aisecurity.paloaltonetworks.com` |
| India | `https://service-in.api.aisecurity.paloaltonetworks.com` |
| Singapore | `https://service-sg.api.aisecurity.paloaltonetworks.com` |

### 3. Validate connectivity

```bash
# Test that your API key and endpoint work
npm run validate-connection

# Confirm prompt injection detection is active
npm run validate-detection
```

### 4. Install hooks into Cursor

If installed from npm:

```bash
prisma-airs-hooks install --global
```

If installed from source:

```bash
npm run install-hooks -- --global  # all workspaces (~/.cursor/hooks.json)
```

This writes `hooks.json` registering two hooks pointing at precompiled JS in `dist/`:
- **`beforeSubmitPrompt`** — scans every prompt before it reaches the AI agent
- **`afterAgentResponse`** — scans every AI response (with code extraction) before display

It also copies `airs-config.json` to the hooks config directory.

> **Why compiled JS?** Hooks run as a fresh process on every prompt/response. Using precompiled JS (`node dist/...`) vs TypeScript (`npx tsx src/...`) eliminates ~1.5s of startup overhead per invocation (npx resolution + tsx transpilation). See [Development mode](#development-mode) for the tsx alternative.

### 5. Restart Cursor

Cursor reads `hooks.json` at startup. **Restart Cursor** to activate the hooks.

### 6. Verify installation

```bash
npm run verify-hooks
```

## Configuration

Runtime config lives at `.cursor/hooks/airs-config.json`:

```json
{
  "endpoint": "${AIRS_API_ENDPOINT}",
  "apiKeyEnvVar": "AIRS_API_KEY",
  "profiles": {
    "prompt": "cursor-ide-prompt-profile",
    "response": "cursor-ide-response-profile"
  },
  "mode": "observe",
  "timeout_ms": 3000,
  "retry": {
    "enabled": true,
    "max_attempts": 1,
    "backoff_base_ms": 200
  },
  "logging": {
    "path": ".cursor/hooks/airs-scan.log",
    "include_content": false
  },
  "enforcement": {
    "prompt_injection": "block",
    "dlp": "block",
    "malicious_code": "block",
    "url_categorization": "block",
    "toxicity": "block",
    "custom_topic": "block"
  },
  "circuit_breaker": {
    "enabled": true,
    "failure_threshold": 5,
    "cooldown_ms": 60000
  }
}
```

### Modes

| Mode | Behavior |
|------|----------|
| `observe` | Log scan results, never block (default — start here) |
| `enforce` | Block prompts/responses that AIRS flags |
| `bypass` | Skip scanning entirely |

### Enforcement actions

When `mode` is `enforce`, each detection service can be configured independently:

| Action | Behavior |
|--------|----------|
| `block` | Prevent the prompt/response from passing through |
| `mask` | Log a warning and allow through (DLP masking) |
| `allow` | Log but allow through |

### Circuit breaker

After `failure_threshold` consecutive AIRS API failures, scanning is temporarily bypassed for `cooldown_ms` milliseconds. A probe request is sent after cooldown — if it succeeds, scanning resumes normally.

## Scanning details

### Prompt scanning (beforeSubmitPrompt)

- Prompt text sent to AIRS with `prompt` content key
- Scanned against the prompt security profile (prompt injection, DLP, toxicity, custom topics)

### Response scanning (afterAgentResponse)

- AI response is parsed by the code extractor:
  - Fenced code blocks (` ```lang `) are extracted with language detection
  - Indented code blocks (4+ spaces) are detected
  - Heuristic fallback for unfenced code-like content
- Natural language goes in the `response` field
- Extracted code goes in the `code_response` field (triggers WildFire/ATP malicious code detection)
- Scanned against the response security profile (malicious code, DLP, URL categorization, toxicity)

### Fail-open design

Scanning **never blocks the developer workflow** on infrastructure failures:
- `failClosed: false` in hooks.json — Cursor allows through if the hook process crashes
- Network errors and timeouts return `{ "permission": "allow" }`
- Config errors return allow with a warning message
- Circuit breaker bypasses scanning after consecutive failures

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile hooks to `dist/` (also runs on `npm install`) |
| `npm test` | Run all tests (66 tests across 9 suites) |
| `npm run typecheck` | TypeScript type checking |
| `npm run validate-connection` | Test AIRS API connectivity |
| `npm run validate-detection` | Verify prompt injection detection |
| `npm run install-hooks` | Write AIRS entries to `.cursor/hooks.json` |
| `npm run uninstall-hooks` | Remove AIRS entries from `.cursor/hooks.json` |
| `npm run verify-hooks` | Check hooks are installed and env vars set |
| `npm run stats` | Show scan statistics from log file |
| `npm run stats -- --since 7d --json` | Stats for last 7 days as JSON |

## Uninstall

```bash
# npm global install
prisma-airs-hooks uninstall --global

# from source
npm run uninstall-hooks -- --global
```

Removes AIRS entries from `.cursor/hooks.json` while preserving other hooks, config, and logs. Restart Cursor after uninstalling.

## Development

```bash
# Install dependencies + build
npm install

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck

# Rebuild after source changes
npm run build

# Build docs
npm run docs:build
```

### Development mode

During development you can run hooks directly from TypeScript source without a build step. This is useful when iterating on hook logic — changes take effect immediately without rebuilding.

Manually edit `~/.cursor/hooks.json` (or `.cursor/hooks.json`) to use tsx:

```json
{
  "command": "npx tsx \"/path/to/prisma-airs-cursor-hooks/src/hooks/before-submit-prompt.ts\""
}
```

This adds ~1.5s per hook invocation compared to compiled JS, so switch back to `node dist/...` for production use:

```bash
npm run build
npm run install-hooks -- --global
```

### Project structure

```
src/                           TypeScript source
  hooks/
    before-submit-prompt.ts    Cursor beforeSubmitPrompt entry point
    after-agent-response.ts    Cursor afterAgentResponse entry point
  config.ts                    Config loader (project → global fallback)
  airs-client.ts               SDK wrapper with circuit breaker
  scanner.ts                   Scan orchestration + DLP masking + UX messages
  code-extractor.ts            Separates code from natural language
  logger.ts                    JSON Lines logging with rotation
  circuit-breaker.ts           Failure tracking with cooldown bypass
  dlp-masking.ts               Per-service enforcement actions
  log-rotation.ts              Rotate logs at 10MB
  types.ts                     TypeScript interfaces
  adapters/                    Multi-IDE adapter layer
dist/                          Compiled JS (production hooks point here)
scripts/
  install-hooks.ts             Write .cursor/hooks.json (points at dist/)
  uninstall-hooks.ts           Remove AIRS entries from hooks.json
  verify-hooks.ts              Tamper detection
  validate-connection.ts       Test AIRS connectivity
  validate-detection.ts        Verify detection works
  airs-stats.ts                Scan statistics CLI
test/
  9 test suites, 66 tests (incl. compiled JS integration tests)
```

## License

MIT
