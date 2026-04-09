# Configuration Reference

Complete reference for `airs-config.json`.

## Fields

### `endpoint`

- **Type:** `string`
- **Default:** `https://service.api.aisecurity.paloaltonetworks.com`
- **Description:** AIRS Sync API base URL. Supports `${PRISMA_AIRS_API_ENDPOINT}` env var reference.

### `apiKeyEnvVar`

- **Type:** `string`
- **Default:** `PRISMA_AIRS_API_KEY`
- **Description:** Name of the environment variable containing the `x-pan-token` API key.

### `profiles`

- **Type:** `{ prompt: string, response: string, tool?: string }`
- **Description:** AIRS security profile names for prompt, response, and tool scanning.

| Field | Env Var | Default |
|-------|---------|---------|
| `profiles.prompt` | `PRISMA_AIRS_PROMPT_PROFILE` | `cursor-ide-prompt-profile` |
| `profiles.response` | `PRISMA_AIRS_RESPONSE_PROFILE` | `cursor-ide-response-profile` |
| `profiles.tool` | `PRISMA_AIRS_TOOL_PROFILE` | `cursor-ide-tool-profile` |

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

### `content_limits`

```json
{
  "max_scan_bytes": 51200,
  "truncate_bytes": 20480
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_scan_bytes` | `number` | `51200` (50KB) | Inputs larger than this are skipped entirely (fail-open) |
| `truncate_bytes` | `number` | `20480` (20KB) | Inputs above this threshold are truncated before scanning |

Applies to all scan paths including `beforeSubmitPrompt`, `beforeMCPExecution`, `postToolUse`, and `afterAgentResponse`. Prevents excessive latency and API errors for large tool outputs, Bash results, or multi-file reads.
