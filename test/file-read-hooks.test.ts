import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { startMockAirsServer, type MockAirsServer } from "./helpers/mock-airs.js";
import { HOOK_DEFS } from "../scripts/lib/hook-registry.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const TMP_DIR = join(import.meta.dirname, ".tmp-file-read-hooks-test");
const CONFIG_DIR = join(TMP_DIR, ".cursor", "hooks");
const CONFIG_PATH = join(CONFIG_DIR, "airs-config.json");

const READ_SCRIPT = join(PROJECT_ROOT, "src", "hooks", "before-read-file.ts");
const TAB_SCRIPT = join(PROJECT_ROOT, "src", "hooks", "before-tab-file-read.ts");

function airsConfig(overrides: Record<string, unknown> = {}): object {
  return {
    endpoint: "https://test.api.prismacloud.io",
    apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
    profiles: { prompt: "test-prompt", response: "test-response", tool: "test-tool" },
    mode: "observe",
    timeout_ms: 3000,
    retry: { enabled: false, max_attempts: 0, backoff_base_ms: 50 },
    logging: { path: join(TMP_DIR, "scan.log"), include_content: false },
    content_limits: { max_scan_bytes: 51200, truncate_bytes: 20000 },
    ...overrides,
  };
}

interface HookRun {
  stdout: string;
  exitCode: number;
  output: Record<string, unknown>;
}

function runHook(scriptPath: string, stdin: object | string): HookRun {
  const raw = typeof stdin === "string" ? stdin : JSON.stringify(stdin);
  const env = {
    ...process.env,
    PRISMA_AIRS_API_KEY: "test-key-123",
    PRISMA_AIRS_API_ENDPOINT: "https://test.api.prismacloud.io",
    NODE_PATH: join(PROJECT_ROOT, "node_modules"),
  };
  try {
    const stdout = execSync(
      `echo '${raw.replace(/'/g, "'\\''")}' | npx tsx ${scriptPath}`,
      { encoding: "utf-8", cwd: TMP_DIR, env, timeout: 15000 },
    );
    return { stdout, exitCode: 0, output: JSON.parse(stdout.trim()) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return {
      stdout: e.stdout ?? "",
      exitCode: e.status ?? -1,
      output: e.stdout ? JSON.parse(e.stdout.trim()) : {},
    };
  }
}

describe("file-read hooks registry entries", () => {
  it("registers beforeReadFile and beforeTabFileRead as optional", () => {
    const read = HOOK_DEFS.find((d) => d.event === "beforeReadFile");
    const tab = HOOK_DEFS.find((d) => d.event === "beforeTabFileRead");
    expect(read).toMatchObject({ slug: "before-read-file", optional: true });
    expect(tab).toMatchObject({ slug: "before-tab-file-read", optional: true });
  });
});

describe("file-read hook entry points — Cursor JSON contract", () => {
  beforeEach(() => {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(airsConfig()));
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  for (const [label, script] of [
    ["before-read-file", READ_SCRIPT],
    ["before-tab-file-read", TAB_SCRIPT],
  ] as const) {
    describe(label, () => {
      it("allows benign file content through (fail-open on unreachable API)", () => {
        const { output, exitCode } = runHook(script, {
          hook_event_name: "beforeReadFile",
          file_path: "/project/src/index.ts",
          content: "export const x = 1;",
        });
        expect(output.permission).toBe("allow");
        expect(exitCode).toBe(0);
      });

      it("allows through on empty content without scanning", () => {
        const { output } = runHook(script, {
          hook_event_name: "beforeReadFile",
          file_path: "/project/empty.ts",
          content: "   ",
        });
        expect(output.permission).toBe("allow");
      });

      it("allows through on invalid stdin JSON", () => {
        const { output, exitCode } = runHook(script, "not json");
        expect(exitCode).toBe(0);
        expect(output.permission).toBe("allow");
      });
    });
  }
});

describe("file-read hooks — enforce mode against mock AIRS", () => {
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

  function writeConfig(mode: "observe" | "enforce") {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify(airsConfig({ mode, endpoint: mockServer.endpoint })),
    );
  }

  it("beforeReadFile denies flagged content with user_message naming the file", () => {
    writeConfig("enforce");
    const { output, exitCode } = runHook(READ_SCRIPT, {
      hook_event_name: "beforeReadFile",
      file_path: "/project/.env",
      content: "AWS_SECRET=BLOCK_ME",
    });
    expect(output.permission).toBe("deny");
    expect(String(output.user_message)).toContain("/project/.env");
    expect(exitCode).toBe(2);
  });

  it("beforeReadFile allows flagged content in observe mode", () => {
    writeConfig("observe");
    const { output, exitCode } = runHook(READ_SCRIPT, {
      hook_event_name: "beforeReadFile",
      file_path: "/project/.env",
      content: "AWS_SECRET=BLOCK_ME",
    });
    expect(output.permission).toBe("allow");
    expect(exitCode).toBe(0);
  });

  it("beforeTabFileRead denies flagged content with bare permission output", () => {
    writeConfig("enforce");
    const { output, exitCode } = runHook(TAB_SCRIPT, {
      hook_event_name: "beforeTabFileRead",
      file_path: "/project/.env",
      content: "AWS_SECRET=BLOCK_ME",
    });
    expect(output).toEqual({ permission: "deny" });
    expect(exitCode).toBe(2);
  });

  it("beforeTabFileRead allows clean content in enforce mode", () => {
    writeConfig("enforce");
    const { output, exitCode } = runHook(TAB_SCRIPT, {
      hook_event_name: "beforeTabFileRead",
      file_path: "/project/src/ok.ts",
      content: "const clean = true;",
    });
    expect(output.permission).toBe("allow");
    expect(exitCode).toBe(0);
  });

  it("beforeReadFile allows oversized content (fail-open on size limit)", () => {
    writeConfig("enforce");
    const { output } = runHook(READ_SCRIPT, {
      hook_event_name: "beforeReadFile",
      file_path: "/project/big.bin",
      content: "BLOCK_ME " + "x".repeat(60000),
    });
    expect(output.permission).toBe("allow");
  });
});
