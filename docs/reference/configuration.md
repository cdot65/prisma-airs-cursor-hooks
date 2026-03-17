# Configuration Reference

Complete reference for `airs-config.json`.

## Fields

### `endpoint`

- **Type:** `string`
- **Default:** `https://service.api.aisecurity.paloaltonetworks.com`
- **Description:** AIRS Sync API base URL. Supports `${AIRS_API_ENDPOINT}` env var reference.

### `apiKeyEnvVar`

- **Type:** `string`
- **Default:** `AIRS_API_KEY`
- **Description:** Name of the environment variable containing the `x-pan-token` API key.

### `profiles`

- **Type:** `{ prompt: string, response: string }`
- **Description:** AIRS security profile names for prompt and response scanning.

| Field | Env Var | Default |
|-------|---------|---------|
| `profiles.prompt` | `AIRS_PROMPT_PROFILE` | `cursor-ide-prompt-profile` |
| `profiles.response` | `AIRS_RESPONSE_PROFILE` | `cursor-ide-response-profile` |

### `mode`

- **Type:** `"observe" | "enforce" | "bypass"`
- **Description:** Scanning mode. See [Modes](../getting-started/configuration.md#modes).

### `timeout_ms`

- **Type:** `number`
- **Description:** AIRS API request timeout in milliseconds.
- **Validation:** Must be a positive number.

### `retry`

```json
{
  "enabled": true,
  "max_attempts": 1,
  "backoff_base_ms": 200
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable retry on transient failures |
| `max_attempts` | `number` | Maximum retry attempts |
| `backoff_base_ms` | `number` | Base delay for exponential backoff |

### `logging`

```json
{
  "path": ".cursor/hooks/airs-scan.log",
  "include_content": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Log file path (relative to working directory) |
| `include_content` | `boolean` | Include prompt/response text in logs |

### `enforcement`

Per-detection-service enforcement actions. See [Detection Services](../features/detection-services.md).

```json
{
  "prompt_injection": "block",
  "dlp": "block",
  "malicious_code": "block",
  "url_categorization": "block",
  "toxicity": "block",
  "custom_topic": "block"
}
```

Valid values: `"block"`, `"mask"`, `"allow"`.

### `circuit_breaker`

```json
{
  "enabled": true,
  "failure_threshold": 5,
  "cooldown_ms": 60000
}
```

See [Circuit Breaker](../features/circuit-breaker.md).
