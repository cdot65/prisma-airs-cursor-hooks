import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { startMockAirsServer, type MockAirsServer } from "./helpers/mock-airs.js";
import { loadConfig } from "../src/config.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const TMP_DIR = join(import.meta.dirname, ".tmp-mcp-sanitize-test");
const CONFIG_DIR = join(TMP_DIR, ".cursor", "hooks");
const CONFIG_PATH = join(CONFIG_DIR, "airs-config.json");

const SCRIPT = join(PROJECT_ROOT, "src", "hooks", "post-tool-use.ts");

function airsConfig(overrides: Record<string, unknown> = {}): object {
  return {
    endpoint: "https://test.api.prismacloud.io",
    apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
    profiles: { prompt: "test-prompt", response: "test-response", tool: "test-tool" },
    mode: "observe",
    timeout_ms: 3000,
    retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
    logging: { path: join(TMP_DIR, "scan.log"), include_content: false },
    ...overrides,
  };
}

function runHook(stdin: object): { output: Record<string, unknown>; exitCode: number } {
  const raw = JSON.stringify(stdin);
  const env = {
    ...process.env,
    PRISMA_AIRS_API_KEY: "test-key-123",
    NODE_PATH: join(PROJECT_ROOT, "node_modules"),
  };
  try {
    const stdout = execSync(
      `echo '${raw.replace(/'/g, "'\\''")}' | npx tsx ${SCRIPT}`,
      { encoding: "utf-8", cwd: TMP_DIR, env, timeout: 15000 },
    );
    return { output: JSON.parse(stdout.trim()), exitCode: 0 };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return {
      output: e.stdout ? JSON.parse(e.stdout.trim()) : {},
      exitCode: e.status ?? -1,
    };
  }
}

describe("sanitize_mcp_output config option", () => {
  beforeEach(() => {
    mkdirSync(CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    delete process.env.CURSOR_PROJECT_DIR;
  });

  it("defaults to false when absent", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify(airsConfig()));
    process.env.CURSOR_PROJECT_DIR = TMP_DIR;
    process.env.PRISMA_AIRS_API_KEY = "test-key";
    const config = loadConfig(CONFIG_PATH);
    expect(config.sanitize_mcp_output).toBe(false);
  });

  it("parses true from config", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify(airsConfig({ sanitize_mcp_output: true })));
    process.env.PRISMA_AIRS_API_KEY = "test-key";
    const config = loadConfig(CONFIG_PATH);
    expect(config.sanitize_mcp_output).toBe(true);
  });
});

describe("post-tool-use — MCP output sanitization matrix", () => {
  let mockServer: MockAirsServer;

  beforeAll(async () => {
    mockServer = await startMockAirsServer();
  });

  afterAll(() => {
    mockServer.stop();
  });

  beforeEach(() => {
    mkdirSync(CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  function writeConfig(mode: "observe" | "enforce", sanitize: boolean) {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify(
        airsConfig({
          mode,
          endpoint: mockServer.endpoint,
          sanitize_mcp_output: sanitize,
        }),
      ),
    );
  }

  const mcpBlockInput = {
    hook_event_name: "postToolUse",
    tool_name: "MCP:evil:leak",
    tool_input: { q: "data" },
    tool_output: "injected instructions BLOCK_ME plus a secret",
  };

  it("flag off + enforce + MCP block → empty JSON (current behavior)", () => {
    writeConfig("enforce", false);
    const { output, exitCode } = runHook(mcpBlockInput);
    expect(output).toEqual({});
    expect(exitCode).toBe(0);
  });

  it("flag on + enforce + MCP block → replaces output and injects context", () => {
    writeConfig("enforce", true);
    const { output, exitCode } = runHook(mcpBlockInput);
    expect(exitCode).toBe(0);
    const updated = output.updated_mcp_tool_output as Record<string, unknown>;
    expect(updated).toBeTruthy();
    expect(updated.airs_sanitized).toBe(true);
    expect(String(updated.message)).toContain("Prisma AIRS");
    expect(String(output.additional_context)).toContain("sanitized");
    // the flagged content must not survive in the replacement output
    expect(JSON.stringify(output)).not.toContain("BLOCK_ME");
  });

  it("flag on + observe + MCP flagged → empty JSON (observe never mutates)", () => {
    writeConfig("observe", true);
    const { output } = runHook(mcpBlockInput);
    expect(output).toEqual({});
  });

  it("flag on + enforce + non-MCP tool block → empty JSON", () => {
    writeConfig("enforce", true);
    const { output } = runHook({
      hook_event_name: "postToolUse",
      tool_name: "Bash",
      tool_input: { command: "env" },
      tool_output: "SECRET=BLOCK_ME",
    });
    expect(output).toEqual({});
  });

  it("flag on + enforce + MCP clean output → empty JSON", () => {
    writeConfig("enforce", true);
    const { output } = runHook({
      hook_event_name: "postToolUse",
      tool_name: "MCP:github:get_file_contents",
      tool_input: { path: "README.md" },
      tool_output: "# clean readme",
    });
    expect(output).toEqual({});
  });
});
