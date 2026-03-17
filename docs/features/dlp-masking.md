# DLP Masking

When a detection service is configured with the `mask` enforcement action, sensitive content is replaced rather than blocked. This is primarily useful for Data Loss Prevention (DLP) findings.

## How It Works

1. AIRS detects sensitive data (PII, credentials, financial data)
2. The enforcement config for `dlp` is checked
3. If set to `mask`, the scanner replaces detected patterns with placeholder text
4. The modified content passes through with a warning logged

## Configuration

```json
{
  "enforcement": {
    "dlp": "mask"
  }
}
```

## Enforcement Priority

When multiple detection services trigger on the same content, the strictest action wins:

```
block > mask > allow
```

For example, if a response triggers both `toxicity: "block"` and `dlp: "mask"`, the response is **blocked** (not masked).

## Masked Content

The developer sees a message indicating that content was modified:

```
AIRS -- Response Modified

Sensitive content was detected and masked before display.
Original content contained DLP findings that were automatically redacted.

Scan ID: abc123-...
```

!!! warning "Masking limitations"
    Masking depends on the detection patterns returned by AIRS. Some sensitive data may not be fully covered by the masking patterns. For maximum security, use `block` instead of `mask` for DLP findings.
