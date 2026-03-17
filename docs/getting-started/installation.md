# Installation

## Prerequisites

- **Node.js 18+** (native fetch, crypto.randomUUID)
- **Cursor IDE** with hooks support
- **Prisma AIRS API key** (`x-pan-token`)
- **AIRS security profiles** configured for prompt and response scanning

## Option A: Install from npm (recommended)

```bash
npm install -g prisma-airs-cursor-hooks
```

This installs the CLI globally and makes the `prisma-airs-hooks` command available system-wide.

## Option B: Install from source

```bash
git clone https://github.com/cdot65/prisma-airs-cursor-hooks.git
cd prisma-airs-cursor-hooks
npm install   # also runs `npm run build` via prepare hook
```

`npm install` automatically compiles TypeScript to `dist/` for fast hook execution.

## Environment Variables

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, or `~/.zsh.d/`):

```bash
export AIRS_API_KEY=<your-x-pan-token>                         # required
export AIRS_API_ENDPOINT=https://service.api.aisecurity.paloaltonetworks.com  # optional
export AIRS_PROMPT_PROFILE=cursor-ide-prompt-profile            # optional
export AIRS_RESPONSE_PROFILE=cursor-ide-response-profile        # optional
```

!!! info "Only `AIRS_API_KEY` is required"
    The endpoint defaults to the US region. Profile names default to `cursor-ide-prompt-profile` and `cursor-ide-response-profile`.

### Regional Endpoints

| Region | Endpoint |
|--------|----------|
| US (default) | `https://service.api.aisecurity.paloaltonetworks.com` |
| EU | `https://service-de.api.aisecurity.paloaltonetworks.com` |
| India | `https://service-in.api.aisecurity.paloaltonetworks.com` |
| Singapore | `https://service-sg.api.aisecurity.paloaltonetworks.com` |

## Register Hooks in Cursor

=== "npm global install"

    ```bash
    # Project-level (current workspace only)
    prisma-airs-hooks install

    # Global (all workspaces)
    prisma-airs-hooks install --global
    ```

=== "From source"

    ```bash
    # Project-level (current workspace only)
    npm run install-hooks

    # Global (all workspaces)
    npm run install-hooks -- --global
    ```

This writes `hooks.json` pointing at the precompiled JS in `dist/` and copies `airs-config.json` to the hooks config directory.

!!! tip "Global installation recommended"
    Use `--global` to install hooks at `~/.cursor/hooks.json` so they apply across all workspaces without per-project setup.

## Validate

```bash
# Test API connectivity
npm run validate-connection

# Confirm detection is working
npm run validate-detection

# Verify hooks are registered
npm run verify-hooks
```

## Restart Cursor

Cursor reads `hooks.json` at startup. **Restart Cursor** to activate the hooks.

## Uninstall

```bash
npm run uninstall-hooks            # project-level
npm run uninstall-hooks -- --global  # global
```

Removes AIRS entries from `hooks.json` while preserving other hooks, config, and logs.
