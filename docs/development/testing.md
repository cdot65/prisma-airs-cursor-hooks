# Testing

## Running Tests

```bash
npm test              # all 66 tests, 9 suites
npm run test:watch    # watch mode with re-run on change
```

## Test Suites

| Suite | Tests | What It Covers |
|-------|-------|---------------|
| `config.test.ts` | 10 | Config loading, validation, env var resolution, defaults |
| `airs-client.test.ts` | 5 | SDK wrapper, prompt/response scanning, block verdicts |
| `scanner.test.ts` | 10 | Observe/enforce/bypass modes, UX messages, fail-open |
| `code-extractor.test.ts` | 10 | Fenced, indented, heuristic extraction, mixed content |
| `circuit-breaker.test.ts` | 7 | State transitions, cooldown, probe success/failure |
| `dlp-masking.test.ts` | 8 | Enforcement priority, content masking |
| `logger.test.ts` | 5 | JSON Lines output, content stripping, directory creation |
| `log-rotation.test.ts` | 3 | Size threshold, rotation, missing file handling |
| `hooks-integration.test.ts` | 8 | End-to-end Cursor JSON contract (tsx + compiled JS) |

## Integration Tests

The `hooks-integration.test.ts` suite runs actual hook scripts with piped JSON:

```typescript
// Runs: echo '{"prompt":"..."}' | npx tsx src/hooks/before-submit-prompt.ts
// And:  echo '{"prompt":"..."}' | node dist/hooks/before-submit-prompt.js
```

These verify the real Cursor contract end-to-end, including JSON parsing, config loading, fail-open behavior, and correct output format.

## Mocking

- **AIRS API**: Not mocked in integration tests -- hooks fail-open when the API is unreachable, which validates the fail-open design
- **SDK**: Mocked via `vi.mock("@cdot65/prisma-airs-sdk")` in unit tests (`airs-client.test.ts`, `scanner.test.ts`)
- **File system**: Tests use temporary directories (`test/.tmp-*`) cleaned up in `afterEach`

## Adding Tests

1. Create `test/<module>.test.ts` matching the source file
2. Use vitest's `describe`/`it`/`expect` API
3. Clean up any temp files in `afterEach`
4. For integration tests, use `execSync` to run hooks with piped JSON
