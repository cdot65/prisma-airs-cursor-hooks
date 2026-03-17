# Design Decisions

## Fail-Open by Default

Every error path resolves to allowing the prompt/response through. This includes:

- Config file not found or invalid
- AIRS API unreachable or timeout
- JSON parse errors on stdin
- Unhandled exceptions in hook code
- Circuit breaker in open state

**Rationale:** Blocking a developer's workflow due to infrastructure issues is unacceptable. Security scanning is a guardrail, not a gate.

## Precompiled JS for Production

Hooks run as fresh processes on every prompt/response. Using `node dist/*.js` instead of `npx tsx src/*.ts` eliminates ~1.5s of cold-start overhead per invocation.

| Cost | `npx tsx` | `node dist/` |
|------|-----------|--------------|
| npx resolution | ~300ms | 0ms |
| TypeScript transpile | ~1200ms | 0ms |
| Module loading | ~200ms | ~200ms |
| AIRS API call | ~600ms | ~600ms |
| **Total** | **~2300ms** | **~800ms** |

## Separate Cursor Hook Contracts

Cursor uses different output formats for different hooks:

- `beforeSubmitPrompt`: `{ "continue": true/false, "user_message": "..." }`
- `afterAgentResponse`: `{ "permission": "allow"/"deny" }` + exit code 2 for deny

This was discovered through testing -- `permission: "deny"` does not block prompts in `beforeSubmitPrompt`.

## Three-Mode System

- **Observe**: Deploy first to audit what AIRS detects without disrupting developers
- **Enforce**: Enable blocking once you've tuned your AIRS profiles and reviewed false positives in the scan logs
- **Bypass**: Disable scanning without uninstalling hooks (debugging, incidents)

## Per-Service Enforcement

Each AIRS detection service (prompt injection, DLP, toxicity, malicious code, URL categorization, custom topics) can be configured with independent enforcement actions. This enables:

- Block prompt injection but only log toxicity
- Mask DLP findings instead of blocking
- Allow URL categorization findings through while blocking everything else

## Global Config Fallback

Config search checks project-level paths first, then falls back to `~/.cursor/hooks/airs-config.json`. This enables global hook installation with a single config file that works across all Cursor workspaces.

## SDK Integration

Built on `@cdot65/prisma-airs-sdk` rather than raw HTTP. This inherits:

- HMAC payload signing
- Retry with exponential backoff
- Response type safety
- Auth header management
