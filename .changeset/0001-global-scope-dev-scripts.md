---
"@cdot65/prisma-airs-cursor-hooks": patch
---

Fix maintenance scripts to respect a global install. `verify-hooks` now accepts `--global` to check `~/.cursor` (previously always reported a global install as missing), and `stats` now reads the scan log path from your AIRS config — the same log `logs` reads — instead of a stale project-local path.
