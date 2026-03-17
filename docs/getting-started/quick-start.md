# Quick Start

Get Prisma AIRS scanning in Cursor in under 5 minutes.

## 1. Install

```bash
git clone https://github.com/cdot65/prisma-airs-cursor-hooks.git
cd prisma-airs-cursor-hooks
npm install
```

## 2. Set Your API Key

```bash
export AIRS_API_KEY=<your-x-pan-token>
```

## 3. Validate Connectivity

```bash
npm run validate-connection
```

You should see a successful scan result confirming your API key and endpoint work.

## 4. Install Hooks Globally

```bash
npm run install-hooks -- --global
```

## 5. Restart Cursor

Quit and reopen Cursor. Open **Settings > Hooks** to confirm both hooks appear:

- `beforeSubmitPrompt`
- `afterAgentResponse`

## 6. Test It

Send a prompt in Cursor's AI chat. Check the execution log in **Settings > Hooks** to see the hooks fire.

To test blocking, try a prompt that triggers a detection (e.g., a toxic or injection prompt). If your AIRS profile has enforcement set to "block", you'll see:

```
Submission blocked by hook
```

With a detailed message explaining what was detected and why.

## 7. Review Scan Logs

```bash
npm run stats
```

Shows scan totals, block rates, latency percentiles, and detection breakdowns.

## What's Next?

- [Configuration](configuration.md) -- tune modes, enforcement, and profiles
- [Detection Services](../features/detection-services.md) -- what AIRS scans for
- [Architecture](../architecture/overview.md) -- how the hooks work internally
