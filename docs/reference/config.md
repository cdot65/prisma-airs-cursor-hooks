# Configuration Reference

Configuration lives at `airs-config.json` (project root) or `.cursor/hooks/airs-config.json`.

## Full Schema

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
  }
}
```

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | string | — | AIRS API base URL. Supports `${ENV_VAR}` syntax. |
| `apiKeyEnvVar` | string | `"AIRS_API_KEY"` | Name of env var holding the API key |
| `profiles.prompt` | string | — | AIRS profile name for prompt scanning |
| `profiles.response` | string | — | AIRS profile name for response scanning |
| `mode` | `"observe"` \| `"enforce"` \| `"bypass"` | `"observe"` | Scanning mode |
| `timeout_ms` | number | `3000` | API call timeout in milliseconds |
| `retry.enabled` | boolean | `true` | Enable retry on 5xx |
| `retry.max_attempts` | number | `1` | Retry attempts after initial failure |
| `retry.backoff_base_ms` | number | `200` | Base backoff delay |
| `logging.path` | string | `".cursor/hooks/airs-scan.log"` | Log file path |
| `logging.include_content` | boolean | `false` | Log prompt/response content (debug only) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AIRS_API_KEY` | Yes | x-pan-token for AIRS API authentication |
| `AIRS_API_ENDPOINT` | Yes | Regional AIRS API base URL |
