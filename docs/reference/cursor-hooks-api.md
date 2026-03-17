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

### afterAgentResponse

```json
{
  "permission": "allow"
}
```

To block (also exit with code 2):

```json
{
  "permission": "deny",
  "userMessage": "Reason for blocking..."
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (check JSON output for allow/deny) |
| 2 | Deny/block the action |
| Other | Hook error (fail-open if `failClosed: false`) |

!!! warning "Different contracts per hook"
    `beforeSubmitPrompt` uses `{ continue: false }` to block. `afterAgentResponse` uses `{ permission: "deny" }` + exit code 2. These are different Cursor API contracts -- using the wrong one will not block.
