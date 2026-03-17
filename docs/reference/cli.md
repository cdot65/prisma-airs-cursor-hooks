# CLI Commands

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type checking |
| `npm run validate-connection` | Test AIRS API connectivity |
| `npm run validate-detection` | Verify prompt injection detection |
| `npm run install-hooks` | Write AIRS entries to `.cursor/hooks.json` |
| `npm run uninstall-hooks` | Remove AIRS entries from `.cursor/hooks.json` |
| `npm run verify-hooks` | Check hooks are installed and env vars set |
| `npm run stats` | Show scan statistics |
| `npm run docs:dev` | Start docs dev server |
| `npm run docs:build` | Build docs for production |

## Stats CLI

```bash
# Default: last 24 hours
npm run stats

# Custom time range
npm run stats -- --since 7d
npm run stats -- --since 12h

# JSON output
npm run stats -- --json

# Combined
npm run stats -- --since 48h --json
```
