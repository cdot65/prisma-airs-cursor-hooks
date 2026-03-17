# Contributing

## Setup

```bash
git clone https://github.com/cdot65/prisma-airs-cursor-hooks.git
cd prisma-airs-cursor-hooks
npm install
```

## Development Workflow

### Source Changes

Edit TypeScript in `src/`. After changes:

```bash
npm run build      # compile to dist/
npm test           # run all tests
npm run typecheck  # type check
```

### Development Mode Hooks

For rapid iteration, point hooks.json at TypeScript source (no rebuild needed):

```json
{
  "command": "npx tsx \"/path/to/src/hooks/before-submit-prompt.ts\""
}
```

This adds ~1.5s per invocation. Switch back to compiled JS for production:

```bash
npm run build
npm run install-hooks -- --global
```

### Running Tests

```bash
npm test              # all tests once
npm run test:watch    # watch mode
```

Tests include:

- **Unit tests**: config, scanner, code-extractor, circuit-breaker, DLP masking, logger, log rotation
- **Integration tests**: end-to-end hook execution via `npx tsx` and compiled `node` with piped JSON

### Adding a Test

Tests live in `test/` and use vitest. Each module has a corresponding test file:

```
src/scanner.ts     → test/scanner.test.ts
src/config.ts      → test/config.test.ts
```

## Project Structure

```
src/                    TypeScript source
  hooks/                Hook entry points (stdin → scan → stdout)
  adapters/             Multi-IDE adapter layer
dist/                   Compiled JS (git-ignored)
scripts/                CLI utilities (install, validate, stats)
test/                   Vitest test suites
docs/                   MkDocs documentation
```

## Pull Request Guidelines

- Branch from `main`
- Ensure `npm test` and `npm run typecheck` pass
- Include tests for new functionality
- Run `npm run build` to verify compilation
