# Detection Services

Prisma AIRS provides several detection services that scan for different categories of risk. Each service can be independently configured with an enforcement action in `airs-config.json`.

## Available Services

### Prompt Injection

Detects attempts to manipulate the AI agent by injecting adversarial instructions into the prompt. Includes jailbreak attempts, role-play attacks, and instruction override techniques.

**Applies to:** Prompts

### Data Loss Prevention (DLP)

Detects sensitive data in prompts and responses, including:

- Personal identifiable information (PII)
- API keys and credentials
- Financial data
- Healthcare records

**Applies to:** Prompts and Responses

### Toxicity

Detects harmful, offensive, or inappropriate content including hate speech, harassment, threats, and explicit material.

**Applies to:** Prompts and Responses

### Malicious Code

Detects malicious code patterns in AI-generated responses using WildFire and Advanced Threat Prevention (ATP) engines. Catches reverse shells, credential stealers, obfuscated payloads, and known malware signatures.

**Applies to:** Responses (via `code_response` field)

!!! info "Requires code extraction"
    Malicious code detection only triggers when code blocks are extracted from the AI response and sent in the `code_response` field. The code extractor handles this automatically.

### URL Categorization

Detects suspicious or malicious URLs in AI responses. Checks URLs against Palo Alto Networks' URL filtering database.

**Applies to:** Responses

### Custom Topics

Detects violations of custom topic policies configured in your AIRS security profile. Use this for organization-specific content policies.

**Applies to:** Prompts and Responses

## Enforcement Configuration

```json
{
  "enforcement": {
    "prompt_injection": "block",
    "dlp": "block",
    "malicious_code": "block",
    "url_categorization": "block",
    "toxicity": "block",
    "custom_topic": "block"
  }
}
```

Each service supports three actions:

| Action | Behavior |
|--------|----------|
| `block` | Prevent the content from passing through |
| `mask` | Replace sensitive content and allow through |
| `allow` | Log the detection but allow through |

When multiple services trigger on the same content, the strictest action wins.

## Block Messages

When a prompt or response is blocked, the developer sees a formatted message:

```
AIRS -- Prompt Blocked

What happened: Your prompt was flagged by the Toxic Content security
check. Category: malicious Profile: Cursor IDE - Hooks

What to do:
- Review your prompt for sensitive data, injection patterns, or policy violations.
- Modify the prompt and try again.
- If you believe this is a false positive, contact your security team
and reference Scan ID: 0d874858-bbf1-4fcd-aa0f-6f91919a9d8e
```
