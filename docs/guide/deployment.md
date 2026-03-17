# Deployment

## Observe Mode (Recommended First)

Start with `mode: "observe"` in `airs-config.json`. This logs all scan results without blocking any prompts or responses. Monitor `.cursor/hooks/airs-scan.log` for a few days to validate detection accuracy before enabling enforcement.

## Enforce Mode

Set `mode: "enforce"` in `airs-config.json`. Blocked prompts/responses will show a message indicating which detection service flagged the content.

### Per-Service Enforcement

Configure granular enforcement actions per detection service:

```json
{
  "enforcement": {
    "prompt_injection": "block",
    "dlp": "mask",
    "malicious_code": "block",
    "url_categorization": "block",
    "toxicity": "block",
    "custom_topic": "block"
  }
}
```

## Centralized Distribution

Hooks reside in user space (`.cursor/hooks/`) and can be removed by the developer. For enterprise deployments, pair with:

- **MDM (Jamf/Intune)**: Push hook archive + run install script
- **Dotfiles repo**: Include hooks in team dotfiles
- **Network-layer enforcement**: Use Prisma AIRS Network Intercept as a backstop
- **Agent gateway**: Route IDE traffic through an AIRS-integrated proxy

## Monitoring

View scan statistics:

```bash
npm run stats
npm run stats -- --since 7d --json
```
