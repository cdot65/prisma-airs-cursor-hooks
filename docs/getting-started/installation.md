# Installation

## Prerequisites

- **Node.js 18+** (native fetch, crypto.randomUUID)
- **Cursor IDE** with hooks support
- **Prisma AIRS API key** (`x-pan-token`)
- **AIRS security profiles** configured for prompt and response scanning

## Install

=== "npm (recommended)"

    ```bash
    npm install -g @cdot65/prisma-airs-cursor-hooks
    ```

    This installs the CLI globally and makes the `prisma-airs-hooks` command available system-wide.

=== "From source"

    ```bash
    git clone https://github.com/cdot65/prisma-airs-cursor-hooks.git
    cd prisma-airs-cursor-hooks
    npm install
    npm run build
    ```

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

## Validate Connectivity

=== "npm global install"

    ```bash
    prisma-airs-hooks validate-connection
    prisma-airs-hooks validate-detection
    ```

=== "From source"

    ```bash
    npm run validate-connection
    npm run validate-detection
    ```

## Register Hooks in Cursor

=== "npm global install"

    ```bash
    prisma-airs-hooks install --global
    ```

=== "From source"

    ```bash
    npm run install-hooks -- --global
    ```

This writes `hooks.json` pointing at the precompiled JS in `dist/` and copies `airs-config.json` to the hooks config directory.

!!! tip "Global installation recommended"
    Use `--global` to install hooks at `~/.cursor/hooks.json` so they apply across all workspaces without per-project setup.

## Restart Cursor

Cursor reads `hooks.json` at startup. **Restart Cursor** to activate the hooks.

## Verify

=== "npm global install"

    ```bash
    prisma-airs-hooks verify
    ```

=== "From source"

    ```bash
    npm run verify-hooks
    ```

## Uninstall

=== "npm global install"

    ```bash
    prisma-airs-hooks uninstall --global
    ```

=== "From source"

    ```bash
    npm run uninstall-hooks -- --global
    ```

Removes AIRS entries from `hooks.json` while preserving other hooks, config, and logs.
