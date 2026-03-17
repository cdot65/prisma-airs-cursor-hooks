# Configuration

Runtime configuration lives at `.cursor/hooks/airs-config.json` (project-level) or `~/.cursor/hooks/airs-config.json` (global). The config loader searches in this order:

1. `CURSOR_PROJECT_DIR/.cursor/hooks/airs-config.json`
2. `cwd/.cursor/hooks/airs-config.json`
3. `~/.cursor/hooks/airs-config.json` (global fallback)
4. `cwd/airs-config.json` (project root)

## Full Config Example

```json
{
  "endpoint": "${AIRS_API_ENDPOINT}",
  "apiKeyEnvVar": "AIRS_API_KEY",
  "profiles": {
    "prompt": "${AIRS_PROMPT_PROFILE}",
    "response": "${AIRS_RESPONSE_PROFILE}"
  },
  "mode": "enforce",
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

## Modes

| Mode | Behavior |
|------|----------|
| `observe` | Log scan results, never block. Start here to audit before enforcing. |
| `enforce` | Block prompts/responses that AIRS flags, based on enforcement actions. |
| `bypass` | Skip scanning entirely. Useful for debugging. |

## Enforcement Actions

When `mode` is `enforce`, each detection service can be configured independently:

| Action | Behavior |
|--------|----------|
| `block` | Prevent the prompt/response from passing through |
| `mask` | Replace sensitive content and allow through (DLP) |
| `allow` | Log the detection but allow through |

!!! tip "Priority order"
    If multiple detection services trigger, the strictest action wins: `block` > `mask` > `allow`.

## Environment Variable Resolution

Config values containing `${VAR_NAME}` are resolved from environment variables at load time. If the variable is unset, defaults apply:

| Config Field | Env Var | Default |
|-------------|---------|---------|
| `endpoint` | `AIRS_API_ENDPOINT` | `https://service.api.aisecurity.paloaltonetworks.com` |
| `profiles.prompt` | `AIRS_PROMPT_PROFILE` | `cursor-ide-prompt-profile` |
| `profiles.response` | `AIRS_RESPONSE_PROFILE` | `cursor-ide-response-profile` |

## Logging

Scan results are written as JSON Lines to the configured `logging.path`. Set `include_content: true` to include prompt/response text in logs (disabled by default for privacy).

Logs rotate automatically at 10MB, keeping the 5 most recent rotations.

## Circuit Breaker

See [Circuit Breaker](../features/circuit-breaker.md) for details on failure handling.
