# Detection Services

## Prompt Profile

| Service | Key | Description |
|---------|-----|-------------|
| Prompt Injection | `prompt_injection` | Detects jailbreaks, instruction overrides |
| DLP | `dlp` | Catches secrets, API keys, PII in prompts |
| Custom Topics | `custom_topic` | Enforces organizational topic policies |
| Toxicity | `toxicity` | Filters abusive or inappropriate content |

## Response Profile

| Service | Key | Description |
|---------|-----|-------------|
| Malicious Code | `malicious_code` | WildFire + ATP analysis via `code_response` |
| DLP | `dlp` | Detects sensitive data in responses |
| URL Categorization | `url_categorization` | Flags suspicious URLs in code/comments |
| Prompt Injection | `prompt_injection` | Detects indirect injection in responses |
| Toxicity | `toxicity` | Filters inappropriate response content |

## code_response Key

The `code_response` content key triggers dedicated malicious code detection (WildFire static/dynamic + Advanced Threat Prevention ML). Without it, code is treated as natural language.

Supported languages: JavaScript, Python, VBScript, PowerShell, Batch, Shell, Perl.

## Enforcement Actions

Per-service enforcement can be configured:

| Action | Behavior |
|--------|----------|
| `block` | Prevent prompt/response from passing through |
| `mask` | Replace sensitive data with asterisks (DLP only) |
| `allow` | Log but allow through |
