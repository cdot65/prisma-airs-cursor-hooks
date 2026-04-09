# Tool Hook Expansion + Env Var Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `beforeMCPExecution` and `postToolUse` hooks, rename env vars from `AIRS_*` to `PRISMA_AIRS_*`, and add configurable content size limits.

**Architecture:** Extend existing hook pattern — standalone entry points calling scanner functions. New `scanToolEvent()` in scanner.ts uses SDK `Content({ toolEvent })`. Content limits applied universally via a shared utility. Hard-cut env var rename across all 21+ files.

**Tech Stack:** TypeScript, Node.js 18+, `@cdot65/prisma-airs-sdk`, vitest, Cursor hooks.json v1

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `src/hooks/before-mcp-execution.ts` | Cursor `beforeMCPExecution` entry point (can block) |
| `src/hooks/post-tool-use.ts` | Cursor `postToolUse` entry point (observe-only) |
| `src/tool-name-parser.ts` | Parse `MCP:<server>:<tool>` into components |
| `src/content-limits.ts` | Configurable skip/truncate before scanning |
| `test/tool-name-parser.test.ts` | Unit tests for tool name parsing |
| `test/content-limits.test.ts` | Unit tests for content limit logic |

### Modified Files
| File | Changes |
|------|---------|
| `src/types.ts` | Add `ProfileConfig.tool`, `ContentLimitsConfig`, `BeforeMCPExecutionInput`, `PostToolUseInput` |
| `src/config.ts` | Rename env vars, add `profiles.tool` default, add `content_limits` defaults |
| `src/airs-client.ts` | Add `scanToolEventContent()` |
| `src/scanner.ts` | Add `scanToolEvent()`, integrate content limits into all scan functions |
| `src/hooks/before-submit-prompt.ts` | No code changes (env var rename is in config layer) |
| `src/hooks/after-agent-response.ts` | No code changes |
| `airs-config.json` | Rename env vars, add `profiles.tool`, `content_limits` |
| `.env.example` | Rename all env vars |
| `scripts/install-hooks.ts` | Register 4 hooks, update env var names in console output |
| `scripts/uninstall-hooks.ts` | Remove all 4 hook keys |
| `scripts/verify-hooks.ts` | Verify new env vars, new hooks, new dist files |
| `test/config.test.ts` | Update all env var refs, add tool profile + content_limits tests |
| `test/airs-client.test.ts` | Update env var refs, add `scanToolEventContent` tests |
| `test/scanner.test.ts` | Update env var refs, add `scanToolEvent` tests |
| `test/hooks-integration.test.ts` | Update env var refs, add integration tests for new hooks |
| All docs + README.md + CLAUDE.md | Env var rename, new hook docs, updated diagrams |

---

### Task 1: Tool Name Parser

**Files:**
- Create: `src/tool-name-parser.ts`
- Create: `test/tool-name-parser.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/tool-name-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseToolName } from "../src/tool-name-parser.js";

describe("parseToolName", () => {
  it("parses MCP tool with server and tool name", () => {
    const result = parseToolName("MCP:github:get_file_contents");
    expect(result).toEqual({ server: "github", tool: "get_file_contents" });
  });

  it("parses MCP tool with nested colons in tool name", () => {
    const result = parseToolName("MCP:filesystem:read:nested");
    expect(result).toEqual({ server: "filesystem", tool: "read:nested" });
  });

  it("returns cursor server for non-MCP tools", () => {
    const result = parseToolName("Bash");
    expect(result).toEqual({ server: "cursor", tool: "Bash" });
  });

  it("returns cursor server for Write tool", () => {
    const result = parseToolName("Write");
    expect(result).toEqual({ server: "cursor", tool: "Write" });
  });

  it("returns cursor server for Edit tool", () => {
    const result = parseToolName("Edit");
    expect(result).toEqual({ server: "cursor", tool: "Edit" });
  });

  it("handles empty string", () => {
    const result = parseToolName("");
    expect(result).toEqual({ server: "cursor", tool: "" });
  });

  it("handles MCP prefix with no tool", () => {
    const result = parseToolName("MCP:server");
    expect(result).toEqual({ server: "server", tool: "server" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tool-name-parser.test.ts`
Expected: FAIL — module `../src/tool-name-parser.js` not found

- [ ] **Step 3: Write implementation**

```typescript
// src/tool-name-parser.ts

/** Parsed tool name components */
export interface ParsedToolName {
  server: string;
  tool: string;
}

/**
 * Parse a Cursor tool_name into server and tool components.
 *
 * "MCP:github:get_file_contents" → { server: "github", tool: "get_file_contents" }
 * "MCP:filesystem:read:nested"   → { server: "filesystem", tool: "read:nested" }
 * "Bash"                         → { server: "cursor", tool: "Bash" }
 */
export function parseToolName(raw: string): ParsedToolName {
  if (raw.startsWith("MCP:")) {
    const withoutPrefix = raw.slice(4);
    const firstColon = withoutPrefix.indexOf(":");
    if (firstColon === -1) {
      return { server: withoutPrefix, tool: withoutPrefix };
    }
    return {
      server: withoutPrefix.slice(0, firstColon),
      tool: withoutPrefix.slice(firstColon + 1),
    };
  }
  return { server: "cursor", tool: raw };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tool-name-parser.test.ts`
Expected: PASS — all 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/tool-name-parser.ts test/tool-name-parser.test.ts
git commit -m "feat: add tool name parser for MCP:<server>:<tool> format"
```

---

### Task 2: Content Limits

**Files:**
- Create: `src/content-limits.ts`
- Create: `test/content-limits.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/content-limits.test.ts
import { describe, it, expect } from "vitest";
import { applyContentLimits, DEFAULT_CONTENT_LIMITS } from "../src/content-limits.js";
import type { ContentLimitsConfig } from "../src/types.js";

describe("applyContentLimits", () => {
  const limits: ContentLimitsConfig = {
    max_scan_bytes: 100,
    truncate_bytes: 50,
  };

  it("passes through content under truncate threshold", () => {
    const result = applyContentLimits("hello", limits);
    expect(result).toEqual({ content: "hello", skipped: false });
  });

  it("skips content exceeding max_scan_bytes", () => {
    const big = "x".repeat(101);
    const result = applyContentLimits(big, limits);
    expect(result).toEqual({ content: "", skipped: true });
  });

  it("truncates content between truncate_bytes and max_scan_bytes", () => {
    const medium = "a".repeat(75);
    const result = applyContentLimits(medium, limits);
    expect(result.skipped).toBe(false);
    expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(50);
  });

  it("truncates at UTF-8 boundary without splitting multibyte chars", () => {
    // Each emoji is 4 bytes. 13 emojis = 52 bytes > truncate_bytes(50)
    const emojis = "\u{1F600}".repeat(13);
    const result = applyContentLimits(emojis, limits);
    expect(result.skipped).toBe(false);
    // Should truncate to 12 emojis (48 bytes) rather than splitting a char
    expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(50);
    // Verify no broken surrogate pairs
    expect(result.content).toBe("\u{1F600}".repeat(12));
  });

  it("handles empty string", () => {
    const result = applyContentLimits("", limits);
    expect(result).toEqual({ content: "", skipped: false });
  });

  it("exports sensible defaults", () => {
    expect(DEFAULT_CONTENT_LIMITS.max_scan_bytes).toBe(51200);
    expect(DEFAULT_CONTENT_LIMITS.truncate_bytes).toBe(20000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/content-limits.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Add `ContentLimitsConfig` to types.ts**

Add after the `CircuitBreakerConfig` interface in `src/types.ts`:

```typescript
/** Content size limits for scanning */
export interface ContentLimitsConfig {
  max_scan_bytes: number;
  truncate_bytes: number;
}
```

Add `content_limits` to `AirsConfig`:

```typescript
/** Top-level AIRS configuration (airs-config.json) */
export interface AirsConfig {
  endpoint: string;
  apiKeyEnvVar: string;
  profiles: ProfileConfig;
  mode: Mode;
  timeout_ms: number;
  retry: RetryConfig;
  logging: LoggingConfig;
  enforcement?: EnforcementConfig;
  circuit_breaker?: CircuitBreakerConfig;
  /** Content size limits for scanning */
  content_limits?: ContentLimitsConfig;
}
```

- [ ] **Step 4: Write implementation**

```typescript
// src/content-limits.ts
import type { ContentLimitsConfig } from "./types.js";

export const DEFAULT_CONTENT_LIMITS: ContentLimitsConfig = {
  max_scan_bytes: 51200,
  truncate_bytes: 20000,
};

export interface ContentLimitResult {
  content: string;
  skipped: boolean;
}

/**
 * Apply size limits to content before scanning.
 * - Above max_scan_bytes: skip entirely
 * - Above truncate_bytes: truncate at UTF-8 boundary
 * - Otherwise: pass through
 */
export function applyContentLimits(
  content: string,
  limits: ContentLimitsConfig,
): ContentLimitResult {
  const byteLength = Buffer.byteLength(content);

  if (byteLength > limits.max_scan_bytes) {
    return { content: "", skipped: true };
  }

  if (byteLength > limits.truncate_bytes) {
    const buf = Buffer.from(content);
    // Find the last complete UTF-8 character at or before truncate_bytes
    let end = limits.truncate_bytes;
    // Walk back if we're in the middle of a multibyte character
    while (end > 0 && (buf[end] & 0xc0) === 0x80) {
      end--;
    }
    return { content: buf.slice(0, end).toString("utf-8"), skipped: false };
  }

  return { content, skipped: false };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/content-limits.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/content-limits.ts src/types.ts test/content-limits.test.ts
git commit -m "feat: add configurable content size limits for scanning"
```

---

### Task 3: Types — New Hook Inputs and Profile

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `tool` to `ProfileConfig`**

In `src/types.ts`, change:

```typescript
/** Profile configuration */
export interface ProfileConfig {
  prompt: string;
  response: string;
}
```

to:

```typescript
/** Profile configuration */
export interface ProfileConfig {
  prompt: string;
  response: string;
  tool: string;
}
```

- [ ] **Step 2: Add `BeforeMCPExecutionInput` type**

Add after `AfterAgentResponseInput` in `src/types.ts`:

```typescript
/** stdin for beforeMCPExecution hook */
export interface BeforeMCPExecutionInput extends CursorHookInput {
  tool_name: string;
  tool_input: unknown;
}
```

- [ ] **Step 3: Add `PostToolUseInput` type**

Add after `BeforeMCPExecutionInput`:

```typescript
/** stdin for postToolUse hook */
export interface PostToolUseInput extends CursorHookInput {
  tool_name: string;
  tool_input: unknown;
  tool_output: unknown;
  tool_use_id?: string;
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in `config.ts` (missing `profiles.tool` handling) — expected, will fix in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add tool profile, MCP and postToolUse input types"
```

---

### Task 4: Environment Variable Rename + Config Updates

**Files:**
- Modify: `src/config.ts`
- Modify: `airs-config.json`
- Modify: `.env.example`
- Modify: `test/config.test.ts`

- [ ] **Step 1: Update `airs-config.json`**

Replace entire file:

```json
{
  "endpoint": "${PRISMA_AIRS_API_ENDPOINT}",
  "apiKeyEnvVar": "PRISMA_AIRS_API_KEY",
  "profiles": {
    "prompt": "${PRISMA_AIRS_PROMPT_PROFILE}",
    "response": "${PRISMA_AIRS_RESPONSE_PROFILE}",
    "tool": "${PRISMA_AIRS_TOOL_PROFILE}"
  },
  "mode": "enforce",
  "timeout_ms": 3000,
  "retry": {
    "enabled": true,
    "max_attempts": 1,
    "backoff_base_ms": 200
  },
  "logging": {
    "path": ".cursor/hooks/airs-scan.log",
    "include_content": false
  },
  "enforcement": {
    "prompt_injection": "block",
    "dlp": "block",
    "malicious_code": "block",
    "url_categorization": "block",
    "toxicity": "block",
    "custom_topic": "block"
  },
  "circuit_breaker": {
    "enabled": true,
    "failure_threshold": 5,
    "cooldown_ms": 60000
  },
  "content_limits": {
    "max_scan_bytes": 51200,
    "truncate_bytes": 20000
  }
}
```

- [ ] **Step 2: Update `.env.example`**

Replace entire file:

```
PRISMA_AIRS_API_KEY=<your-x-pan-token>
PRISMA_AIRS_API_ENDPOINT=https://service.api.aisecurity.paloaltonetworks.com
PRISMA_AIRS_PROMPT_PROFILE=Cursor IDE - Hooks
PRISMA_AIRS_RESPONSE_PROFILE=Cursor IDE - Hooks
PRISMA_AIRS_TOOL_PROFILE=Cursor IDE - Hooks
```

- [ ] **Step 3: Update `src/config.ts`**

Replace entire file contents of `src/config.ts`:

```typescript
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import type { AirsConfig, Mode } from "./types.js";
import { DEFAULT_CONTENT_LIMITS } from "./content-limits.js";

const VALID_MODES: Mode[] = ["observe", "enforce", "bypass"];
const DEFAULT_ENDPOINT = "https://service.api.aisecurity.paloaltonetworks.com";
const DEFAULT_PROFILE = "Cursor IDE - Hooks";

/** Resolve environment variable references like ${VAR_NAME} */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

/** Validate a URL string */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the config file path by searching (in order):
 *   1. Explicit path argument
 *   2. .cursor/hooks/airs-config.json in CURSOR_PROJECT_DIR (project-level)
 *   3. .cursor/hooks/airs-config.json in cwd
 *   4. ~/.cursor/hooks/airs-config.json (global/user-level)
 *   5. airs-config.json in cwd (project root fallback)
 */
function resolveConfigPath(configPath?: string): string {
  if (configPath) return configPath;

  const candidates: string[] = [];

  const cursorDir = process.env.CURSOR_PROJECT_DIR;
  if (cursorDir) {
    candidates.push(join(cursorDir, ".cursor", "hooks", "airs-config.json"));
  }

  candidates.push(
    join(process.cwd(), ".cursor", "hooks", "airs-config.json"),
    join(homedir(), ".cursor", "hooks", "airs-config.json"),
    resolve(process.cwd(), "airs-config.json"),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

/** Load and validate AIRS configuration from a JSON file */
export function loadConfig(configPath?: string): AirsConfig {
  const resolved = resolveConfigPath(configPath);

  let raw: string;
  try {
    raw = readFileSync(resolved, "utf-8");
  } catch {
    throw new Error(`Failed to read config file: ${resolved}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${resolved}`);
  }

  const config = parsed as unknown as AirsConfig;

  // Resolve env var references in endpoint
  config.endpoint = resolveEnvVars(config.endpoint);
  if (!config.endpoint || config.endpoint === "${PRISMA_AIRS_API_ENDPOINT}") {
    config.endpoint = DEFAULT_ENDPOINT;
  }

  // Resolve env var references in profile names
  config.profiles.prompt = resolveEnvVars(config.profiles.prompt) || DEFAULT_PROFILE;
  config.profiles.response = resolveEnvVars(config.profiles.response) || DEFAULT_PROFILE;
  config.profiles.tool = resolveEnvVars(config.profiles?.tool ?? "") || DEFAULT_PROFILE;

  // Validate mode
  if (!VALID_MODES.includes(config.mode)) {
    throw new Error(
      `Invalid mode "${config.mode}". Must be one of: ${VALID_MODES.join(", ")}`,
    );
  }

  // Validate endpoint URL
  if (!isValidUrl(config.endpoint)) {
    throw new Error(`Invalid endpoint URL: "${config.endpoint}"`);
  }

  // Validate API key env var is set
  const apiKey = process.env[config.apiKeyEnvVar];
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      `API key environment variable "${config.apiKeyEnvVar}" is not set or empty`,
    );
  }

  // Validate profiles
  if (!config.profiles?.prompt || !config.profiles?.response) {
    throw new Error("Config must include profiles.prompt and profiles.response");
  }

  // Validate timeout
  if (typeof config.timeout_ms !== "number" || config.timeout_ms <= 0) {
    throw new Error("timeout_ms must be a positive number");
  }

  // Apply content limits defaults
  config.content_limits = {
    ...DEFAULT_CONTENT_LIMITS,
    ...config.content_limits,
  };

  return config;
}

/** Get the API key value from the environment */
export function getApiKey(config: AirsConfig): string {
  return process.env[config.apiKeyEnvVar] ?? "";
}
```

- [ ] **Step 4: Update `test/config.test.ts`**

Replace entire file:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-config-test");

function writeConfig(overrides: Record<string, unknown> = {}) {
  const base = {
    endpoint: "https://us-east1.api.prismacloud.io",
    apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
    profiles: { prompt: "prompt-profile", response: "response-profile", tool: "tool-profile" },
    mode: "observe",
    timeout_ms: 3000,
    retry: { enabled: true, max_attempts: 1, backoff_base_ms: 200 },
    logging: { path: ".cursor/hooks/airs-scan.log", include_content: false },
    ...overrides,
  };
  const path = join(TMP_DIR, "airs-config.json");
  writeFileSync(path, JSON.stringify(base));
  return path;
}

describe("config", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    process.env.PRISMA_AIRS_API_KEY = "test-key-123";
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    delete process.env.PRISMA_AIRS_API_KEY;
  });

  it("loads valid config", () => {
    const path = writeConfig();
    const config = loadConfig(path);
    expect(config.mode).toBe("observe");
    expect(config.profiles.prompt).toBe("prompt-profile");
    expect(config.profiles.tool).toBe("tool-profile");
  });

  it("rejects invalid mode", () => {
    const path = writeConfig({ mode: "yolo" });
    expect(() => loadConfig(path)).toThrow('Invalid mode "yolo"');
  });

  it("rejects missing API key env var", () => {
    delete process.env.PRISMA_AIRS_API_KEY;
    const path = writeConfig();
    expect(() => loadConfig(path)).toThrow("not set or empty");
  });

  it("rejects malformed endpoint URL", () => {
    const path = writeConfig({ endpoint: "not-a-url" });
    expect(() => loadConfig(path)).toThrow("Invalid endpoint URL");
  });

  it("rejects missing config file", () => {
    expect(() => loadConfig("/nonexistent/path.json")).toThrow(
      "Failed to read config file",
    );
  });

  it("resolves env var references in endpoint", () => {
    process.env.PRISMA_AIRS_API_ENDPOINT = "https://eu-west1.api.prismacloud.io";
    const path = writeConfig({ endpoint: "${PRISMA_AIRS_API_ENDPOINT}" });
    const config = loadConfig(path);
    expect(config.endpoint).toBe("https://eu-west1.api.prismacloud.io");
    delete process.env.PRISMA_AIRS_API_ENDPOINT;
  });

  it("defaults endpoint when env var is unset", () => {
    delete process.env.PRISMA_AIRS_API_ENDPOINT;
    const path = writeConfig({ endpoint: "${PRISMA_AIRS_API_ENDPOINT}" });
    const config = loadConfig(path);
    expect(config.endpoint).toBe("https://service.api.aisecurity.paloaltonetworks.com");
  });

  it("defaults profile names when env vars are unset", () => {
    const path = writeConfig({
      profiles: {
        prompt: "${PRISMA_AIRS_PROMPT_PROFILE}",
        response: "${PRISMA_AIRS_RESPONSE_PROFILE}",
        tool: "${PRISMA_AIRS_TOOL_PROFILE}",
      },
    });
    const config = loadConfig(path);
    expect(config.profiles.prompt).toBe("Cursor IDE - Hooks");
    expect(config.profiles.response).toBe("Cursor IDE - Hooks");
    expect(config.profiles.tool).toBe("Cursor IDE - Hooks");
  });

  it("resolves profile env vars when set", () => {
    process.env.PRISMA_AIRS_PROMPT_PROFILE = "custom-prompt";
    process.env.PRISMA_AIRS_RESPONSE_PROFILE = "custom-response";
    process.env.PRISMA_AIRS_TOOL_PROFILE = "custom-tool";
    const path = writeConfig({
      profiles: {
        prompt: "${PRISMA_AIRS_PROMPT_PROFILE}",
        response: "${PRISMA_AIRS_RESPONSE_PROFILE}",
        tool: "${PRISMA_AIRS_TOOL_PROFILE}",
      },
    });
    const config = loadConfig(path);
    expect(config.profiles.prompt).toBe("custom-prompt");
    expect(config.profiles.response).toBe("custom-response");
    expect(config.profiles.tool).toBe("custom-tool");
    delete process.env.PRISMA_AIRS_PROMPT_PROFILE;
    delete process.env.PRISMA_AIRS_RESPONSE_PROFILE;
    delete process.env.PRISMA_AIRS_TOOL_PROFILE;
  });

  it("rejects invalid JSON", () => {
    const path = join(TMP_DIR, "airs-config.json");
    writeFileSync(path, "not json at all");
    expect(() => loadConfig(path)).toThrow("Invalid JSON");
  });

  it("applies default content limits when not specified", () => {
    const path = writeConfig();
    const config = loadConfig(path);
    expect(config.content_limits).toEqual({
      max_scan_bytes: 51200,
      truncate_bytes: 20000,
    });
  });

  it("merges custom content limits with defaults", () => {
    const path = writeConfig({
      content_limits: { max_scan_bytes: 100000 },
    });
    const config = loadConfig(path);
    expect(config.content_limits!.max_scan_bytes).toBe(100000);
    expect(config.content_limits!.truncate_bytes).toBe(20000);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/config.test.ts`
Expected: PASS — all 12 tests

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (may still have errors in scanner.test.ts and other test files referencing old env var names — those are fixed in later tasks)

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/types.ts airs-config.json .env.example test/config.test.ts
git commit -m "feat!: rename env vars AIRS_* → PRISMA_AIRS_*, add tool profile + content_limits"
```

---

### Task 5: AIRS Client — `scanToolEventContent`

**Files:**
- Modify: `src/airs-client.ts`
- Modify: `test/airs-client.test.ts`

- [ ] **Step 1: Update test env vars and add `scanToolEventContent` test**

In `test/airs-client.test.ts`, replace all occurrences of `AIRS_API_KEY` with `PRISMA_AIRS_API_KEY` and update the mock config to include `profiles.tool`. Then add:

```typescript
describe("scanToolEventContent", () => {
  it("constructs Content with toolEvent and calls syncScan", async () => {
    const mockResult = { action: "allow", scan_id: "scan-1" };
    vi.mocked(MockScanner.prototype.syncScan).mockResolvedValue(mockResult as any);

    const { result, latencyMs } = await scanToolEventContent(
      mockConfig,
      "github",
      "get_file_contents",
      '{"path": "/etc/passwd"}',
      undefined,
      "test-user",
    );

    expect(result.action).toBe("allow");
    expect(latencyMs).toBeGreaterThanOrEqual(0);

    // Verify Content was constructed with toolEvent
    const contentArg = vi.mocked(MockScanner.prototype.syncScan).mock.calls[0][1];
    const json = contentArg.toJSON();
    expect(json.tool_event).toBeDefined();
    expect(json.tool_event.metadata.ecosystem).toBe("mcp");
    expect(json.tool_event.metadata.server_name).toBe("github");
    expect(json.tool_event.metadata.tool_invoked).toBe("get_file_contents");
    expect(json.tool_event.input).toBe('{"path": "/etc/passwd"}');
  });

  it("includes output when provided", async () => {
    const mockResult = { action: "allow", scan_id: "scan-1" };
    vi.mocked(MockScanner.prototype.syncScan).mockResolvedValue(mockResult as any);

    await scanToolEventContent(
      mockConfig,
      "filesystem",
      "read_file",
      '{"path": "test.txt"}',
      "file contents here",
      "test-user",
    );

    const contentArg = vi.mocked(MockScanner.prototype.syncScan).mock.calls[0][1];
    const json = contentArg.toJSON();
    expect(json.tool_event.output).toBe("file contents here");
  });

  it("uses tool profile name", async () => {
    const mockResult = { action: "allow", scan_id: "scan-1" };
    vi.mocked(MockScanner.prototype.syncScan).mockResolvedValue(mockResult as any);

    await scanToolEventContent(mockConfig, "s", "t", "in", undefined, "user");

    const profileArg = vi.mocked(MockScanner.prototype.syncScan).mock.calls[0][0];
    expect(profileArg.profile_name).toBe("test-tool");
  });
});
```

Update `mockConfig` to:
```typescript
const mockConfig: AirsConfig = {
  endpoint: "https://test.api.prismacloud.io",
  apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
  profiles: { prompt: "test-prompt", response: "test-response", tool: "test-tool" },
  mode: "observe",
  timeout_ms: 3000,
  retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
  logging: { path: "/dev/null", include_content: false },
};
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/airs-client.test.ts`
Expected: FAIL — `scanToolEventContent` not exported

- [ ] **Step 3: Add `scanToolEventContent` to `src/airs-client.ts`**

Add after the `scanResponseContent` function:

```typescript
/** Scan a tool event (MCP input/output) via AIRS Sync API using the SDK */
export async function scanToolEventContent(
  config: AirsConfig,
  serverName: string,
  toolInvoked: string,
  input: string | undefined,
  output: string | undefined,
  appUser: string,
  logger?: Logger,
): Promise<{ result: ScanResponse; latencyMs: number }> {
  ensureInit(config, logger);

  if (breaker && !breaker.shouldAllow()) {
    logger?.logEvent("scan_bypassed_circuit_open", { direction: "tool" });
    return { result: circuitOpenResult(), latencyMs: 0 };
  }

  const scanner = new Scanner();
  const toolEvent: Record<string, unknown> = {
    metadata: {
      ecosystem: "mcp",
      method: "tools/call",
      server_name: serverName,
      tool_invoked: toolInvoked,
    },
  };
  if (input !== undefined) toolEvent.input = input;
  if (output !== undefined) toolEvent.output = output;

  const content = new Content({ toolEvent });

  const start = Date.now();
  try {
    const result = await scanner.syncScan(
      { profile_name: config.profiles.tool },
      content,
      { metadata: { app_name: "cursor-ide", app_user: appUser } },
    );
    const latencyMs = Date.now() - start;
    breaker?.recordSuccess();
    return { result, latencyMs };
  } catch (err) {
    breaker?.recordFailure();
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/airs-client.test.ts`
Expected: PASS — all tests including new scanToolEventContent tests

- [ ] **Step 5: Commit**

```bash
git add src/airs-client.ts test/airs-client.test.ts
git commit -m "feat: add scanToolEventContent for MCP tool_event scanning"
```

---

### Task 6: Scanner — `scanToolEvent`

**Files:**
- Modify: `src/scanner.ts`
- Modify: `test/scanner.test.ts`

- [ ] **Step 1: Update test env vars and add `scanToolEvent` tests**

In `test/scanner.test.ts`, replace all `AIRS_API_KEY` with `PRISMA_AIRS_API_KEY`. Update `mockConfig` to include `profiles.tool: "test-tool"`. Add mock for `scanToolEventContent`:

```typescript
vi.mock("../src/airs-client.js", () => ({
  scanPromptContent: vi.fn(),
  scanResponseContent: vi.fn(),
  scanToolEventContent: vi.fn(),
  resetInit: vi.fn(),
  AISecSDKException: class AISecSDKException extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AISecSDKException";
    }
  },
}));

import { scanPrompt, scanResponse, scanToolEvent } from "../src/scanner.js";
import { scanPromptContent, scanResponseContent, scanToolEventContent } from "../src/airs-client.js";
```

Add `scanToolEvent` describe block:

```typescript
describe("scanToolEvent", () => {
  let logger: Logger;

  beforeEach(() => {
    process.env.PRISMA_AIRS_API_KEY = "test-key";
    logger = new Logger("/dev/null");
    vi.mocked(scanToolEventContent).mockReset();
  });

  afterEach(() => {
    delete process.env.PRISMA_AIRS_API_KEY;
  });

  it("scans tool event and passes in observe mode", async () => {
    vi.mocked(scanToolEventContent).mockResolvedValue({
      result: {
        action: "block",
        scan_id: "scan-tool-1",
        report_id: "report-tool-1",
        category: "malicious",
        prompt_detected: { injection: true },
      } as any,
      latencyMs: 100,
    });

    const result = await scanToolEvent(mockConfig, "MCP:github:get_file", '{"path":"x"}', undefined, logger);
    expect(result.action).toBe("pass");
  });

  it("blocks tool event in enforce mode", async () => {
    vi.mocked(scanToolEventContent).mockResolvedValue({
      result: {
        action: "block",
        scan_id: "scan-tool-2",
        report_id: "report-tool-2",
        category: "malicious",
        prompt_detected: { injection: true },
      } as any,
      latencyMs: 100,
    });

    const config = { ...mockConfig, mode: "enforce" as const };
    const result = await scanToolEvent(config, "MCP:github:get_file", '{"path":"x"}', undefined, logger);
    expect(result.action).toBe("block");
    expect(result.message).toContain("MCP Tool Call");
    expect(result.message).toContain("Prompt Injection");
  });

  it("passes in bypass mode without calling API", async () => {
    const config = { ...mockConfig, mode: "bypass" as const };
    const result = await scanToolEvent(config, "MCP:s:t", "input", undefined, logger);
    expect(result.action).toBe("pass");
    expect(scanToolEventContent).not.toHaveBeenCalled();
  });

  it("fails open on SDK error", async () => {
    vi.mocked(scanToolEventContent).mockRejectedValue(new Error("network down"));
    const result = await scanToolEvent(mockConfig, "MCP:s:t", "input", undefined, logger);
    expect(result.action).toBe("pass");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/scanner.test.ts`
Expected: FAIL — `scanToolEvent` not exported from scanner

- [ ] **Step 3: Add `scanToolEvent` and block message to `src/scanner.ts`**

Add import for `scanToolEventContent`:

```typescript
import {
  scanPromptContent,
  scanResponseContent,
  scanToolEventContent,
  AISecSDKException,
} from "./airs-client.js";
```

Add import for `parseToolName`:

```typescript
import { parseToolName } from "./tool-name-parser.js";
```

Add block message builder after `buildResponseBlockMessage`:

```typescript
function buildToolBlockMessage(
  toolName: string,
  detections: string[],
  category: string,
  profileName: string,
  scanId: string,
): string {
  const detectionList = detections.map(friendlyDetectionName).join(", ");
  return [
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "  Prisma AIRS — MCP Tool Call Blocked",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `  Tool:       ${toolName}`,
    `  What happened:  The tool input was flagged by the ${detectionList} security check.`,
    `  Category:       ${category}`,
    `  Profile:        ${profileName}`,
    "",
    "  What to do:",
    "    - The tool input may contain injection patterns or malicious parameters.",
    "    - If you believe this is a false positive, contact your security team",
    `      and reference Scan ID: ${scanId}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ].join("\n");
}
```

Add `scanToolEvent` function after `scanResponse`:

```typescript
// ---------------------------------------------------------------------------
// scanToolEvent — called by beforeMCPExecution and postToolUse hooks
// ---------------------------------------------------------------------------

export async function scanToolEvent(
  config: AirsConfig,
  toolName: string,
  input: string | undefined,
  output: string | undefined,
  logger: Logger,
): Promise<HookResult> {
  if (config.mode === "bypass") {
    logger.logEvent("scan_bypassed", { direction: "tool" });
    return { action: "pass" };
  }

  if (!input?.trim() && !output?.trim()) {
    return { action: "pass" };
  }

  const appUser = getAppUser();
  const parsed = parseToolName(toolName);

  try {
    const { result, latencyMs } = await scanToolEventContent(
      config, parsed.server, parsed.tool, input, output, appUser, logger,
    );

    const verdict = result.action === "block" ? "block" : "allow";
    const { services: detections, findings } = extractDetections(result);

    const actionTaken =
      config.mode === "observe"
        ? "observed"
        : verdict === "block"
          ? "blocked"
          : "allowed";

    logger.logScan({
      event: "scan_complete",
      scan_id: result.scan_id ?? "",
      direction: "tool" as ScanDirection,
      verdict: verdict as "allow" | "block",
      action_taken: actionTaken,
      latency_ms: latencyMs,
      detection_services_triggered: detections,
      error: null,
    });

    if (config.mode === "enforce" && verdict === "block") {
      const enforcement = config.enforcement ?? DEFAULT_ENFORCEMENT;
      const enforcementAction = getEnforcementAction(findings, enforcement);

      if (enforcementAction === "allow") {
        return { action: "pass" };
      }

      if (enforcementAction === "mask") {
        const maskedServices = findings
          .filter((f) => (enforcement[f.detection_service] ?? "block") === "mask")
          .map((f) => f.detection_service);
        logger.logEvent("dlp_mask_applied", { direction: "tool", services: maskedServices });
        return { action: "pass", message: buildMaskedMessage(maskedServices) };
      }

      return {
        action: "block",
        message: buildToolBlockMessage(
          toolName,
          detections,
          result.category ?? "policy violation",
          config.profiles.tool,
          result.scan_id ?? "unknown",
        ),
      };
    }

    return { action: "pass" };
  } catch (err) {
    const isAuth =
      err instanceof AISecSDKException && err.message.includes("401");

    const message = isAuth
      ? "AIRS authentication failed. Check your API key."
      : "AIRS scan failed — allowing tool event (fail-open)";

    logger.logScan({
      event: "scan_error",
      scan_id: "",
      direction: "tool",
      verdict: "allow",
      action_taken: "error",
      latency_ms: 0,
      detection_services_triggered: [],
      error: message,
    });

    if (isAuth) {
      return { action: "pass", message: `Warning: ${message}` };
    }
    return { action: "pass" };
  }
}
```

- [ ] **Step 4: Add `"tool"` to `ScanDirection` type in `src/types.ts`**

Change:
```typescript
export type ScanDirection = "prompt" | "response";
```
to:
```typescript
export type ScanDirection = "prompt" | "response" | "tool";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/scanner.test.ts`
Expected: PASS — all tests

- [ ] **Step 6: Commit**

```bash
git add src/scanner.ts src/types.ts test/scanner.test.ts
git commit -m "feat: add scanToolEvent for MCP tool input/output scanning"
```

---

### Task 7: Hook — `beforeMCPExecution`

**Files:**
- Create: `src/hooks/before-mcp-execution.ts`

- [ ] **Step 1: Write the hook entry point**

```typescript
// src/hooks/before-mcp-execution.ts
#!/usr/bin/env node
/**
 * Cursor hook: beforeMCPExecution (can block)
 *
 * Fires before an MCP tool call executes. Scans the tool input via
 * Prisma AIRS tool_event content type. Can block the tool call if
 * AIRS flags the input (e.g. prompt injection, malicious parameters).
 *
 * Cursor contract:
 *   stdin  → JSON { tool_name, tool_input, ... }
 *   stdout → JSON { permission: "allow"|"deny", userMessage?, agentMessage? }
 *   exit 0 = success, exit 2 = deny
 *   stderr → debug logs (visible in Cursor "Hooks" output panel)
 */
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import { scanToolEvent } from "../scanner.js";
import { applyContentLimits, DEFAULT_CONTENT_LIMITS } from "../content-limits.js";
import type { BeforeMCPExecutionInput, CursorHookOutput } from "../types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function respond(output: CursorHookOutput): void {
  process.stdout.write(JSON.stringify(output) + "\n");
}

function allowThrough(message?: string): void {
  const output: CursorHookOutput = { permission: "allow" };
  if (message) output.userMessage = message;
  respond(output);
}

/** Normalize unknown tool_input to a string for scanning */
function normalizeInput(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw === null || raw === undefined) return "";
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let input: BeforeMCPExecutionInput;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error("[AIRS] Failed to parse hook stdin as JSON, allowing through.");
    allowThrough();
    return;
  }

  if (input.user_email) {
    process.env.CURSOR_USER_EMAIL = input.user_email;
  }

  const toolName = input.tool_name;
  if (!toolName) {
    console.error("[AIRS] No tool_name in input, allowing through.");
    allowThrough();
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[AIRS] Config error: ${err}`);
    allowThrough("Prisma AIRS: configuration error — scan skipped (fail-open).");
    return;
  }

  const logger = new Logger(config.logging.path, config.logging.include_content);

  const inputStr = normalizeInput(input.tool_input);
  if (!inputStr.trim()) {
    allowThrough();
    return;
  }

  // Apply content limits
  const limits = config.content_limits ?? DEFAULT_CONTENT_LIMITS;
  const limited = applyContentLimits(inputStr, limits);
  if (limited.skipped) {
    logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
    allowThrough();
    return;
  }

  const result = await scanToolEvent(config, toolName, limited.content, undefined, logger);

  if (result.action === "block") {
    const output: CursorHookOutput = {
      permission: "deny",
      userMessage: result.message ?? "Prisma AIRS blocked this MCP tool call.",
      agentMessage: `AIRS security scan blocked ${toolName}. Do not retry this tool call. Inform the user that the tool input was flagged by security scanning.`,
    };
    respond(output);
    process.exit(2);
  }

  allowThrough(result.message);
}

main().catch((err) => {
  console.error(`[AIRS] Unhandled hook error: ${err}`);
  allowThrough();
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/before-mcp-execution.ts
git commit -m "feat: add beforeMCPExecution hook entry point"
```

---

### Task 8: Hook — `postToolUse`

**Files:**
- Create: `src/hooks/post-tool-use.ts`

- [ ] **Step 1: Write the hook entry point**

```typescript
// src/hooks/post-tool-use.ts
#!/usr/bin/env node
/**
 * Cursor hook: postToolUse (observe-only)
 *
 * Fires after any tool executes. Scans tool outputs for security violations.
 * Cannot block — observe-only. Logs violations for audit and emits warnings.
 *
 * Routing:
 *   MCP:*  → scan input + output as tool_event
 *   Bash   → scan output as response
 *   Write  → scan content for DLP via prompt
 *   Edit   → scan new_string for DLP via prompt
 *   Others → skip (Grep, Read, Glob, Delete, Task, NotebookEdit)
 *
 * Cursor contract:
 *   stdin  → JSON { tool_name, tool_input, tool_output, tool_use_id, ... }
 *   stdout → JSON {} (always allow)
 *   exit 0 always
 *   stderr → debug logs
 */
import { loadConfig } from "../config.js";
import { Logger } from "../logger.js";
import { scanToolEvent, scanResponse, scanPrompt } from "../scanner.js";
import { applyContentLimits, DEFAULT_CONTENT_LIMITS } from "../content-limits.js";
import type { PostToolUseInput } from "../types.js";

const SKIP_TOOLS = new Set(["Grep", "Read", "Glob", "Delete", "Task", "NotebookEdit"]);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function respond(): void {
  process.stdout.write("{}\n");
}

/** Normalize unknown value to a string */
function normalize(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw === null || raw === undefined) return "";
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

async function main(): Promise<void> {
  const raw = await readStdin();

  let input: PostToolUseInput;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error("[AIRS] Failed to parse hook stdin as JSON.");
    respond();
    return;
  }

  if (input.user_email) {
    process.env.CURSOR_USER_EMAIL = input.user_email;
  }

  const toolName = input.tool_name ?? "unknown";

  // Skip Cursor built-in tools that operate on local files
  if (SKIP_TOOLS.has(toolName)) {
    respond();
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[AIRS] Config error: ${err}`);
    respond();
    return;
  }

  const logger = new Logger(config.logging.path, config.logging.include_content);
  const limits = config.content_limits ?? DEFAULT_CONTENT_LIMITS;

  let result;

  if (toolName === "Write") {
    // Scan file content for DLP
    const content = normalize((input.tool_input as Record<string, unknown>)?.content);
    if (!content.trim()) { respond(); return; }
    const limited = applyContentLimits(content, limits);
    if (limited.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      respond();
      return;
    }
    result = await scanPrompt(config, limited.content, logger);
  } else if (toolName === "Edit") {
    // Scan new_string for DLP
    const newString = normalize((input.tool_input as Record<string, unknown>)?.new_string);
    if (!newString.trim()) { respond(); return; }
    const limited = applyContentLimits(newString, limits);
    if (limited.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      respond();
      return;
    }
    result = await scanPrompt(config, limited.content, logger);
  } else if (toolName.startsWith("MCP:")) {
    // Scan as tool_event (structured input + output)
    const toolInput = normalize(input.tool_input);
    const toolOutput = normalize(input.tool_output);
    if (!toolInput.trim() && !toolOutput.trim()) { respond(); return; }
    const limitedInput = applyContentLimits(toolInput, limits);
    const limitedOutput = applyContentLimits(toolOutput, limits);
    if (limitedInput.skipped && limitedOutput.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      respond();
      return;
    }
    result = await scanToolEvent(
      config, toolName,
      limitedInput.skipped ? undefined : limitedInput.content,
      limitedOutput.skipped ? undefined : limitedOutput.content,
      logger,
    );
  } else {
    // Shell / Bash — scan output as response
    const toolOutput = normalize(input.tool_output);
    if (!toolOutput.trim()) { respond(); return; }
    const limited = applyContentLimits(toolOutput, limits);
    if (limited.skipped) {
      logger.logEvent("scan_skipped_size_limit", { direction: "tool", tool: toolName });
      respond();
      return;
    }
    result = await scanResponse(config, limited.content, logger);
  }

  // postToolUse is observe-only — log violations, emit warning, never block
  if (result.action === "block") {
    console.error(`[AIRS] postToolUse violation detected for tool=${toolName} (observe-only, cannot block).`);
  }

  respond();
}

main().catch((err) => {
  console.error(`[AIRS] Unhandled hook error: ${err}`);
  respond();
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/post-tool-use.ts
git commit -m "feat: add postToolUse hook entry point (observe-only)"
```

---

### Task 9: Integration Tests for New Hooks

**Files:**
- Modify: `test/hooks-integration.test.ts`

- [ ] **Step 1: Update env vars and add new hook tests**

In `test/hooks-integration.test.ts`, update all `AIRS_API_KEY` → `PRISMA_AIRS_API_KEY` and `AIRS_API_ENDPOINT` → `PRISMA_AIRS_API_ENDPOINT`. Update `AIRS_CONFIG` to include `profiles.tool` and `content_limits`. Add:

```typescript
  describe("before-mcp-execution", () => {
    const SCRIPT = join(import.meta.dirname, "..", "src", "hooks", "before-mcp-execution.ts");

    it("returns valid Cursor JSON with permission field", () => {
      const input: BeforeMCPExecutionInput = {
        hook_event_name: "beforeMCPExecution",
        tool_name: "MCP:github:get_file_contents",
        tool_input: { path: "README.md" },
      };

      const output = runHook(SCRIPT, input);
      expect(output).toHaveProperty("permission");
      expect(["allow", "deny"]).toContain(output.permission);
    });

    it("allows through on empty tool_input", () => {
      const input: BeforeMCPExecutionInput = {
        hook_event_name: "beforeMCPExecution",
        tool_name: "MCP:github:get_file_contents",
        tool_input: {},
      };

      const output = runHook(SCRIPT, input);
      expect(output.permission).toBe("allow");
    });

    it("allows through on missing tool_name", () => {
      const input = {
        hook_event_name: "beforeMCPExecution",
        tool_input: { path: "test" },
      };

      const output = runHook(SCRIPT, input);
      expect(output.permission).toBe("allow");
    });
  });

  describe("post-tool-use", () => {
    const SCRIPT = join(import.meta.dirname, "..", "src", "hooks", "post-tool-use.ts");

    it("returns empty JSON for allowed tool", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "MCP:github:get_file_contents",
        tool_input: { path: "README.md" },
        tool_output: "# My Project\nHello world",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toEqual({});
    });

    it("skips Grep tool (built-in)", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "Grep",
        tool_input: { pattern: "test" },
        tool_output: "file.ts:1:test",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toEqual({});
    });

    it("skips Read tool (built-in)", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/tmp/test.txt" },
        tool_output: "file contents",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toEqual({});
    });

    it("scans Write tool for DLP (fail-open on unreachable API)", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/tmp/test.txt", content: "some content to scan" },
        tool_output: "File written successfully",
      };

      const output = runHook(SCRIPT, input);
      expect(output).toEqual({});
    });
  });
```

Import the new types at top of file:

```typescript
import type { CursorHookOutput, BeforeSubmitPromptOutput, BeforeSubmitPromptInput, AfterAgentResponseInput, BeforeMCPExecutionInput, PostToolUseInput } from "../src/types.js";
```

Update `AIRS_CONFIG` in the test to:

```typescript
const AIRS_CONFIG = {
  endpoint: "https://test.api.prismacloud.io",
  apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
  profiles: { prompt: "test-prompt", response: "test-response", tool: "test-tool" },
  mode: "observe",
  timeout_ms: 3000,
  retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
  logging: { path: join(TMP_DIR, "scan.log"), include_content: false },
  content_limits: { max_scan_bytes: 51200, truncate_bytes: 20000 },
};
```

Update `runHook` env vars:

```typescript
const fullEnv = {
    ...process.env,
    PRISMA_AIRS_API_KEY: "test-key-123",
    PRISMA_AIRS_API_ENDPOINT: "https://test.api.prismacloud.io",
    NODE_PATH: join(PROJECT_ROOT, "node_modules"),
    ...env,
};
```

Add compiled JS tests in the `compiled JS hooks` describe block:

```typescript
    it("compiled beforeMCPExecution allows benign input", () => {
      const input: BeforeMCPExecutionInput = {
        hook_event_name: "beforeMCPExecution",
        tool_name: "MCP:github:get_file_contents",
        tool_input: { path: "README.md" },
      };

      const output = runHook(MCP_JS, input, {}, "node");
      expect(output.permission).toBe("allow");
    });

    it("compiled postToolUse returns empty JSON", () => {
      const input: PostToolUseInput = {
        hook_event_name: "postToolUse",
        tool_name: "MCP:test:tool",
        tool_input: {},
        tool_output: "safe output",
      };

      const output = runHook(POST_TOOL_JS, input, {}, "node");
      expect(output).toEqual({});
    });
```

Add compiled path constants:

```typescript
    const MCP_JS = join(import.meta.dirname, "..", "dist", "hooks", "before-mcp-execution.js");
    const POST_TOOL_JS = join(import.meta.dirname, "..", "dist", "hooks", "post-tool-use.js");
```

- [ ] **Step 2: Build and run tests**

Run: `npm run build && npx vitest run test/hooks-integration.test.ts`
Expected: PASS — all integration tests

- [ ] **Step 3: Commit**

```bash
git add test/hooks-integration.test.ts
git commit -m "test: add integration tests for beforeMCPExecution and postToolUse hooks"
```

---

### Task 10: Update Install / Uninstall / Verify Scripts

**Files:**
- Modify: `scripts/install-hooks.ts`
- Modify: `scripts/uninstall-hooks.ts`
- Modify: `scripts/verify-hooks.ts`

- [ ] **Step 1: Update `scripts/install-hooks.ts`**

Replace `scripts/install-hooks.ts` to register all 4 hooks with new env var names. Key changes:

- Change `process.env.AIRS_API_KEY` to `process.env.PRISMA_AIRS_API_KEY`
- Change `process.env.AIRS_API_ENDPOINT` to `process.env.PRISMA_AIRS_API_ENDPOINT`
- Add `beforeMCPExecution` and `postToolUse` hook registration (same pattern as existing hooks)
- Update console output to show `PRISMA_AIRS_*` env var names
- Add `beforeMCPExecution` and `postToolUse` to the summary output

Add after the `afterResponseCmd` line:

```typescript
  const beforeMCPCmd = `node "${join(distDir, "before-mcp-execution.js")}"`;
  const postToolUseCmd = `node "${join(distDir, "post-tool-use.js")}"`;
```

Add registration blocks for `beforeMCPExecution` and `postToolUse` following the same idempotent pattern as the existing hooks:

```typescript
  if (!hooksConfig.hooks.beforeMCPExecution) {
    hooksConfig.hooks.beforeMCPExecution = [];
  }
  const hasMCPHook = hooksConfig.hooks.beforeMCPExecution.some(
    (h) => h.command.includes("before-mcp-execution"),
  );
  if (!hasMCPHook) {
    hooksConfig.hooks.beforeMCPExecution.push({
      command: beforeMCPCmd,
      timeout: 5000,
      failClosed: false,
    });
  }

  if (!hooksConfig.hooks.postToolUse) {
    hooksConfig.hooks.postToolUse = [];
  }
  const hasPostToolHook = hooksConfig.hooks.postToolUse.some(
    (h) => h.command.includes("post-tool-use"),
  );
  if (!hasPostToolHook) {
    hooksConfig.hooks.postToolUse.push({
      command: postToolUseCmd,
      timeout: 5000,
      failClosed: false,
    });
  }
```

Update the summary console output to list all 4 hooks and new env var names.

- [ ] **Step 2: Update `scripts/uninstall-hooks.ts`**

Add removal blocks for `beforeMCPExecution` and `postToolUse`, following the same pattern. Also update the filter strings to match both `.ts` and `.js` variants — search for `"before-mcp-execution"` and `"post-tool-use"` substrings in the command.

- [ ] **Step 3: Update `scripts/verify-hooks.ts`**

- Change `process.env.AIRS_API_KEY` check to `process.env.PRISMA_AIRS_API_KEY`
- Change `process.env.AIRS_API_ENDPOINT` check to `process.env.PRISMA_AIRS_API_ENDPOINT`
- Add checks for `beforeMCPExecution` and `postToolUse` hook entries
- Add check that all 4 dist files exist

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/install-hooks.ts scripts/uninstall-hooks.ts scripts/verify-hooks.ts
git commit -m "feat: register 4 hooks in install/uninstall/verify scripts, rename env vars"
```

---

### Task 11: Update Remaining Test Files (Env Var Rename)

**Files:**
- Modify: `test/scanner.test.ts` (env var names only — `scanToolEvent` tests already added in Task 6)
- Modify: `test/airs-client.test.ts` (env var names only — `scanToolEventContent` tests already added in Task 5)

- [ ] **Step 1: Verify all `AIRS_API_KEY` references are updated**

Run: `grep -r "AIRS_API_KEY" test/ --include="*.ts" | grep -v PRISMA_AIRS`
Expected: No output (all references should already use `PRISMA_AIRS_API_KEY` from Tasks 4-6)

If any remain, update them.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS — all tests pass

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit** (if any changes were needed)

```bash
git add test/
git commit -m "chore: ensure all tests use PRISMA_AIRS_* env var names"
```

---

### Task 12: Build and Full Integration Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Clean build**

Run: `rm -rf dist && npm run build`
Expected: PASS — all 4 hook files appear in `dist/hooks/`

- [ ] **Step 2: Verify dist files exist**

Run: `ls dist/hooks/`
Expected output includes:
```
after-agent-response.js
before-mcp-execution.js
before-submit-prompt.js
post-tool-use.js
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS — all tests

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit build output** (if dist is tracked)

Check `.gitignore` — if `dist/` is gitignored, skip this step. Otherwise:

```bash
git add dist/
git commit -m "chore: rebuild dist with new hooks"
```

---

### Task 13: Documentation Update

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/index.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/architecture/scanning-flow.md`
- Modify: `docs/architecture/design-decisions.md`
- Modify: `docs/reference/cursor-hooks-api.md`
- Modify: `docs/reference/environment-variables.md`
- Modify: `docs/reference/configuration.md`
- Modify: `docs/getting-started/installation.md`
- Modify: `docs/getting-started/quick-start.md`
- Modify: `docs/getting-started/configuration.md`
- Modify: `docs/about/release-notes.md`

This is a documentation sweep. For each file:

1. Replace all `AIRS_API_KEY` → `PRISMA_AIRS_API_KEY`
2. Replace all `AIRS_API_ENDPOINT` → `PRISMA_AIRS_API_ENDPOINT`
3. Replace all `AIRS_PROMPT_PROFILE` → `PRISMA_AIRS_PROMPT_PROFILE`
4. Replace all `AIRS_RESPONSE_PROFILE` → `PRISMA_AIRS_RESPONSE_PROFILE`
5. Add `PRISMA_AIRS_TOOL_PROFILE` where profile env vars are listed
6. Update architecture diagrams to show 4 hooks
7. Add `beforeMCPExecution` and `postToolUse` hook contract docs
8. Add `profiles.tool` and `content_limits` to config reference
9. Update `docs/about/release-notes.md` with 0.2.0 entry

- [ ] **Step 1: Update README.md**

Update the architecture diagram to show 4 checkpoints. Update env var section. Update hooks list. Add `content_limits` to config example. Update mode table (`enforce` description). Add `beforeMCPExecution` and `postToolUse` to CLI commands / hook list.

- [ ] **Step 2: Update CLAUDE.md**

Update architecture diagram, hook contracts, module table, env vars, key design decisions.

- [ ] **Step 3: Update mkdocs pages**

Update all docs listed above with env var renames, new hook coverage, updated diagrams.

- [ ] **Step 4: Add 0.2.0 release notes**

Add to `docs/about/release-notes.md`:

```markdown
## 0.2.0

### Breaking Changes

- **Environment variable rename**: All `AIRS_*` variables renamed to `PRISMA_AIRS_*`. See migration guide below.

### New Features

- **`beforeMCPExecution` hook** — scans MCP tool inputs before execution via AIRS `tool_event` content type. Can block tool calls flagged for prompt injection, malicious parameters, etc.
- **`postToolUse` hook** — scans MCP, Shell, Write, and Edit tool outputs for DLP, malicious code, and other violations. Observe-only (audit and logging).
- **Per-direction profiles** — new `profiles.tool` for MCP/tool scanning alongside existing `profiles.prompt` and `profiles.response`.
- **Configurable content limits** — `content_limits.max_scan_bytes` (skip threshold, default 50KB) and `content_limits.truncate_bytes` (truncation, default 20KB) applied to all scan paths.

### Migration

Replace in your shell profile:
- `AIRS_API_KEY` → `PRISMA_AIRS_API_KEY`
- `AIRS_API_ENDPOINT` → `PRISMA_AIRS_API_ENDPOINT`
- `AIRS_PROMPT_PROFILE` → `PRISMA_AIRS_PROMPT_PROFILE`
- `AIRS_RESPONSE_PROFILE` → `PRISMA_AIRS_RESPONSE_PROFILE`
- New: `PRISMA_AIRS_TOOL_PROFILE` (optional)

Then reinstall hooks: `prisma-airs-hooks install --global`
```

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md docs/
git commit -m "docs: update all docs for 0.2.0 — new hooks, env var rename, content limits"
```

---

### Task 14: Version Bump and Changeset

**Files:**
- Modify: `package.json`
- Create: `.changeset/0000-tool-hooks-env-rename.md`

- [ ] **Step 1: Bump version in `package.json`**

Change `"version": "0.1.4"` to `"version": "0.2.0"`.

- [ ] **Step 2: Write changeset**

```markdown
---
"@cdot65/prisma-airs-cursor-hooks": minor
---

Add beforeMCPExecution and postToolUse hooks for tool input/output scanning. Rename all env vars from AIRS_* to PRISMA_AIRS_*. Add configurable content size limits. Add per-direction tool profile.
```

- [ ] **Step 3: Commit**

```bash
git add package.json .changeset/0000-tool-hooks-env-rename.md
git commit -m "chore: bump version to 0.2.0"
```
