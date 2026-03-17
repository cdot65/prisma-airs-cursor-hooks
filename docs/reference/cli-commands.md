# CLI Commands

## `prisma-airs-hooks` CLI

After installing globally with `npm install -g @cdot65/prisma-airs-cursor-hooks`:

| Command | Description |
|---------|-------------|
| `prisma-airs-hooks install [--global]` | Register hooks in Cursor's hooks.json |
| `prisma-airs-hooks uninstall [--global]` | Remove AIRS entries from hooks.json |
| `prisma-airs-hooks verify` | Check hooks registration, config, and env vars |
| `prisma-airs-hooks validate-connection` | Test AIRS API connectivity with your credentials |
| `prisma-airs-hooks validate-detection` | Send a test prompt injection and verify detection |
| `prisma-airs-hooks stats [--since <duration>] [--json]` | Show scan statistics |

### Examples

```bash
# Install hooks for all workspaces
prisma-airs-hooks install --global

# Check everything is working
prisma-airs-hooks verify

# Stats for the last 7 days as JSON
prisma-airs-hooks stats --since 7d --json

# Remove hooks
prisma-airs-hooks uninstall --global
```

## npm run scripts (from source)

When working from a cloned repository:

### Build & Test

| Command | Description |
|---------|-------------|
| `npm run build` | Compile hooks to `dist/` |
| `npm test` | Run all tests (66 tests, 9 suites) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |

### Hook Management

| Command | Description |
|---------|-------------|
| `npm run install-hooks` | Install hooks to `.cursor/hooks.json` (project-level) |
| `npm run install-hooks -- --global` | Install hooks to `~/.cursor/hooks.json` (all workspaces) |
| `npm run uninstall-hooks` | Remove AIRS entries from project-level hooks.json |
| `npm run uninstall-hooks -- --global` | Remove AIRS entries from global hooks.json |
| `npm run verify-hooks` | Check hooks registration, config, and env vars |

### Validation

| Command | Description |
|---------|-------------|
| `npm run validate-connection` | Test AIRS API connectivity with your credentials |
| `npm run validate-detection` | Send a test prompt injection and verify detection |

### Statistics

| Command | Description |
|---------|-------------|
| `npm run stats` | Show scan statistics (all time) |
| `npm run stats -- --since 7d` | Stats for the last 7 days |
| `npm run stats -- --since 1d --json` | Stats as JSON output |

### Documentation

| Command | Description |
|---------|-------------|
| `mkdocs serve` | Local docs preview at `http://localhost:8000` |
| `mkdocs build` | Build static docs site to `site/` |
