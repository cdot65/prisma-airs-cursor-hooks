# Quick Start

## Prerequisites

- Node.js 18+
- Cursor IDE
- Prisma AIRS API key and endpoint

## Install

```bash
git clone https://github.com/cdot65/prisma-airs-cursor-hooks.git
cd prisma-airs-cursor-hooks
npm install
```

## Configure Environment

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export AIRS_API_KEY=<your-x-pan-token>
export AIRS_API_ENDPOINT=https://<region>.api.prismacloud.io
```

Cursor inherits your shell environment, so these variables are automatically available to the hook scripts.

## Validate AIRS Connectivity

```bash
# Test API connectivity with a benign prompt
npm run validate-connection

# Test detection with a known prompt injection
npm run validate-detection
```

## Install Hooks

```bash
npm run install-hooks
```

This creates `.cursor/hooks.json` with two hook entries:
- **`beforeSubmitPrompt`** — scans prompts before sending to the AI agent
- **`afterAgentResponse`** — scans responses (including extracted code) before display

It also copies `airs-config.json` to `.cursor/hooks/` for runtime configuration.

## Restart Cursor

Cursor reads `hooks.json` at startup. Restart Cursor to pick up the new hooks.

## Verify

```bash
# Check hooks are properly installed
npm run verify-hooks
```

Send a prompt in Cursor and check the scan log:

```bash
cat .cursor/hooks/airs-scan.log | jq .
```

## Uninstall

```bash
npm run uninstall-hooks
```

This removes AIRS entries from `.cursor/hooks.json` while preserving other hooks, config, and logs.
