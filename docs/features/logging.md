# Logging & Stats

## Scan Logs

Every scan result is written as a JSON Lines entry to the configured log path (default: `.cursor/hooks/airs-scan.log`).

### Log Entry Format

```json
{
  "timestamp": "2026-03-17T09:51:30.881Z",
  "event": "scan_complete",
  "scan_id": "0d874858-bbf1-4fcd-aa0f-6f91919a9d8e",
  "direction": "prompt",
  "verdict": "block",
  "action_taken": "blocked",
  "latency_ms": 641,
  "detection_services_triggered": ["toxicity"],
  "error": null
}
```

| Field | Description |
|-------|-------------|
| `direction` | `prompt` or `response` |
| `verdict` | AIRS verdict: `allow` or `block` |
| `action_taken` | What the hook did: `allowed`, `blocked`, `observed`, `bypassed` |
| `latency_ms` | AIRS API round-trip time |
| `detection_services_triggered` | Which services flagged the content |
| `error` | Error message if scan failed (null on success) |

### Content Privacy

By default, prompt and response content is **not** included in logs. Set `logging.include_content: true` in the config to enable content logging for debugging.

## Log Rotation

Logs rotate automatically when the file exceeds 10MB. The 5 most recent rotations are kept:

```
airs-scan.log        # current
airs-scan.log.1      # previous
airs-scan.log.2
...
airs-scan.log.5      # oldest (deleted on next rotation)
```

## Stats CLI

View scan statistics from the log file:

```bash
# Summary for all time
npm run stats

# Last 7 days
npm run stats -- --since 7d

# Last 24 hours as JSON
npm run stats -- --since 1d --json
```

### Output

```
Prisma AIRS Scan Statistics
===========================

Total scans:      156
  Prompts:        89
  Responses:      67

Verdicts:
  Allowed:        142 (91.0%)
  Blocked:        14  (9.0%)

Detections:
  toxicity:       8
  prompt_injection: 4
  malicious_code:   2

Latency (ms):
  p50:  590
  p95:  820
  p99:  1240
```
