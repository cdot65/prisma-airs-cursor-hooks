import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { startMockAirsServer, type MockAirsServer } from "./helpers/mock-airs.js";
import { HOOK_DEFS } from "../scripts/lib/hook-registry.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const TMP_DIR = join(import.meta.dirname, ".tmp-after-mcp-test");
const CONFIG_DIR = join(TMP_DIR, ".cursor", "hooks");
const CONFIG_PATH = join(CONFIG_DIR, "airs-config.json");
const LOG_PATH = join(TMP_DIR, "scan.log");

const SCRIPT = join(PROJECT_ROOT, "src", "hooks", "after-mcp-execution.ts");

function airsConfig(overrides: Record<string, unknown> = {}): object {
  return {
    endpoint: "https://test.api.prismacloud.io",
    apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
    profiles: { prompt: "test-prompt", response: "test-response", tool: "test-tool" },
    mode: "observe",
    timeout_ms: 3000,
    retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
    logging: { path: LOG_PATH, include_content: false },
    ...overrides,
  };
}

function runHook(stdin: object | string): {
  output: Record<string, unknown>;
  exitCode: number;
  stderr: string;
} {
  const raw = typeof stdin === "string" ? stdin : JSON.stringify(stdin);
  const env = {
    ...process.env,
    PRISMA_AIRS_API_KEY: "test-key-123",
    NODE_PATH: join(PROJECT_ROOT, "node_modules"),
  };
  try {
    const stdout = execSync(
      `echo '${raw.replace(/'/g, "'\\''")}' | npx tsx ${SCRIPT} 2>${TMP_DIR}/stderr.log`,
      { encoding: "utf-8", cwd: TMP_DIR, env, timeout: 15000 },
    );
    const stderr = existsSync(`${TMP_DIR}/stderr.log`)
      ? readFileSync(`${TMP_DIR}/stderr.log`, "utf-8")
      : "";
    return { output: JSON.parse(stdout.trim()), exitCode: 0, stderr };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return {
      output: e.stdout ? JSON.parse(e.stdout.trim()) : {},
      exitCode: e.status ?? -1,
      stderr: "",
    };
  }
}

describe("afterMCPExecution registry entry", () => {
  it("is registered as optional", () => {
    const def = HOOK_DEFS.find((d) => d.event === "afterMCPExecution");
    expect(def).toMatchObject({ slug: "after-mcp-execution", optional: true });
  });
});

describe("after-mcp-execution — Cursor JSON contract (observe-only)", () => {
  beforeEach(() => {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(airsConfig()));
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("returns empty JSON and exit 0 (fail-open on unreachable API)", () => {
    const { output, exitCode } = runHook({
      hook_event_name: "afterMCPExecution",
      tool_name: "MCP:github:get_file_contents",
      tool_input: '{"path":"README.md"}',
      result_json: '{"content":"# hello"}',
      duration: 12,
    });
    expect(output).toEqual({});
    expect(exitCode).toBe(0);
  });

  it("skips scan when input and result are both empty", () => {
    const { output } = runHook({
      hook_event_name: "afterMCPExecution",
      tool_name: "MCP:github:get_file_contents",
      tool_input: "",
      result_json: "",
    });
    expect(output).toEqual({});
  });

  it("allows through on missing tool_name", () => {
    const { output, exitCode } = runHook({
      hook_event_name: "afterMCPExecution",
      tool_input: '{"x":1}',
      result_json: '{"y":2}',
    });
    expect(output).toEqual({});
    expect(exitCode).toBe(0);
  });

  it("returns empty JSON on invalid stdin", () => {
    const { output, exitCode } = runHook("not json");
    expect(output).toEqual({});
    expect(exitCode).toBe(0);
  });
});

describe("after-mcp-execution — violations against mock AIRS", () => {
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

  it("logs violation and still returns empty JSON in enforce mode", () => {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify(airsConfig({ mode: "enforce", endpoint: mockServer.endpoint })),
    );
    const { output, exitCode, stderr } = runHook({
      hook_event_name: "afterMCPExecution",
      tool_name: "MCP:evil:leak",
      tool_input: '{"cmd":"BLOCK_ME"}',
      result_json: '{"secrets":"BLOCK_ME"}',
      duration: 5,
    });
    expect(output).toEqual({});
    expect(exitCode).toBe(0);
    expect(stderr).toContain("[AIRS]");
    const log = readFileSync(LOG_PATH, "utf-8");
    expect(log).toContain("scan_complete");
  });
});
