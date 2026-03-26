# Cursor Hooks API

Reference for how Cursor IDE hooks work and the JSON contracts used by this project.

## hooks.json

Cursor reads hook configuration from multiple locations (all execute if present):

| Scope | Path |
|-------|------|
| Project | `<workspace>/.cursor/hooks.json` |
| User | `~/.cursor/hooks.json` |
| Enterprise | `/Library/Application Support/Cursor/hooks.json` (macOS) |

### Format

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      {
        "command": "node \"/path/to/dist/hooks/before-submit-prompt.js\"",
        "timeout": 5000,
        "failClosed": false
      }
    ],
    "afterAgentResponse": [
      {
        "command": "node \"/path/to/dist/hooks/after-agent-response.js\"",
        "timeout": 5000,
        "failClosed": false
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `command` | Shell command to execute |
| `timeout` | Max execution time in milliseconds |
| `failClosed` | If `true`, block on hook failure. We set `false` (fail-open). |

## Hook Input (stdin)

All hooks receive JSON on stdin with common base fields:

```json
{
  "conversation_id": "...",
  "generation_id": "...",
  "model": "...",
  "hook_event_name": "beforeSubmitPrompt",
  "cursor_version": "...",
  "workspace_roots": ["..."],
  "user_email": "...",
  "transcript_path": "..."
}
```

### beforeSubmitPrompt

Additional fields:

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | The user's prompt text |
| `attachments` | `array` | File attachments (if any) |

### afterAgentResponse

Additional fields:

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | The AI agent's response text |

## Hook Output (stdout)

### beforeSubmitPrompt

```json
{
  "continue": true
}
```

To block:

```json
{
  "continue": false,
  "user_message": "Reason for blocking..."
}
```

### afterAgentResponse (observe-only)

Cursor ignores stdout and exit codes for this hook. We emit JSON for logging consistency, but it has no effect on what the user sees:

```json
{
  "permission": "allow"
}
```

!!! warning "Cannot deny"
    `{ "permission": "deny" }` and exit code 2 are **no-ops** for `afterAgentResponse`. Cursor does not support blocking the response after it has been displayed.

## Exit Codes

| Code | Hook | Meaning |
|------|------|---------|
| 0 | All | Success |
| 2 | `beforeSubmitPrompt` | Deny/block the prompt |
| 2 | `afterAgentResponse` | **No effect** (observe-only) |
| Other | All | Hook error (fail-open if `failClosed: false`) |

!!! warning "Different contracts per hook"
    `beforeSubmitPrompt` uses `{ continue: false }` to block prompts. `afterAgentResponse` is observe-only and **cannot block responses** regardless of output.

## Cursor Limitation: No Response Blocking

Cursor has no `beforeAgentResponse` or equivalent hook. The AI response streams directly to the user, and `afterAgentResponse` fires only after it is already visible.

The hooks that **can** block all cover actions, not response text:

| Hook | What it gates |
|------|---------------|
| `beforeSubmitPrompt` | User prompt → AI |
| `preToolUse` | Agent deciding to call a tool |
| `beforeShellExecution` | Shell commands |
| `beforeMCPExecution` | MCP tool calls |
| `beforeReadFile` | File reads |
| `subagentStart` | Sub-agent spawning |

None of these intercept the AI's natural language or code response before display. This is a gap in Cursor's hook API — there is no point in the pipeline where external code can scan the generated text and block it before the user sees it.

**Recommendations:**

- **Lean on prompt-side blocking** — if AIRS catches a DLP pattern going in, the AI never sees it to echo back
- **Use response scanning for audit** — violations are logged for compliance evidence and security team alerting
- **Request the feature from Cursor** — a `beforeAgentResponse` hook would close this gap. Track or request it on the [Cursor community forum](https://forum.cursor.com)
