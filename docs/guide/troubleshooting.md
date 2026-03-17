# Troubleshooting

## Common Issues

### "API key environment variable is not set or empty"

Set the `AIRS_API_KEY` environment variable:

```bash
export AIRS_API_KEY=<your-x-pan-token>
```

### "Invalid endpoint URL"

Ensure `AIRS_API_ENDPOINT` is a valid URL:

```bash
export AIRS_API_ENDPOINT=https://service.api.aisecurity.paloaltonetworks.com
```

### Hooks not firing

1. Check hooks are installed: `ls .cursor/hooks/`
2. Verify scripts are executable: `chmod +x .cursor/hooks/pre-send.sh`
3. Check Cursor's hook configuration

### High latency

Check scan log latency values:

```bash
npm run stats
```

If p95 > 500ms:
- Check network connectivity to AIRS API
- Reduce `timeout_ms` in config
- Consider `bypass` mode for offline development

### Authentication failures (401/403)

- Verify API key: `npm run validate-connection`
- Check key hasn't expired
- Ensure key has correct permissions for sync scanning

### Circuit breaker open

After 5 consecutive failures, scanning is temporarily bypassed. Check:

```bash
grep "circuit_breaker" .cursor/hooks/airs-scan.log
```

The breaker auto-recovers after 60 seconds.
