import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  cursorDir,
  defaultLogPath,
  globalConfigPath,
  resolveLogPath,
} from "../scripts/lib/paths.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-paths-test");

function writeConfig(loggingPath: string): string {
  const config = {
    endpoint: "https://us-east1.api.prismacloud.io",
    apiKeyEnvVar: "PRISMA_AIRS_API_KEY",
    profiles: { prompt: "p", response: "r", tool: "t" },
    mode: "observe",
    timeout_ms: 3000,
    retry: { enabled: true, max_attempts: 1, backoff_base_ms: 200 },
    logging: { path: loggingPath, include_content: false },
  };
  const path = join(TMP_DIR, "airs-config.json");
  writeFileSync(path, JSON.stringify(config));
  return path;
}

describe("paths helpers", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    savedKey = process.env.PRISMA_AIRS_API_KEY;
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    if (savedKey !== undefined) process.env.PRISMA_AIRS_API_KEY = savedKey;
    else delete process.env.PRISMA_AIRS_API_KEY;
  });

  it("cursorDir(true) resolves under the home directory", () => {
    expect(cursorDir(true)).toBe(join(homedir(), ".cursor"));
  });

  it("cursorDir(false) resolves under the current working directory", () => {
    expect(cursorDir(false)).toBe(join(process.cwd(), ".cursor"));
  });

  it("defaultLogPath points at the global scan log", () => {
    expect(defaultLogPath()).toBe(
      join(homedir(), ".cursor", "hooks", "airs-scan.log"),
    );
  });

  it("globalConfigPath points at the global config", () => {
    expect(globalConfigPath()).toBe(
      join(homedir(), ".cursor", "hooks", "airs-config.json"),
    );
  });

  it("resolveLogPath returns the config's log path when loadable", () => {
    process.env.PRISMA_AIRS_API_KEY = "test-key-123";
    const configPath = writeConfig("/custom/scan.log");
    expect(resolveLogPath(configPath)).toBe("/custom/scan.log");
  });

  it("resolveLogPath resolves a leading ~ in the config log path", () => {
    process.env.PRISMA_AIRS_API_KEY = "test-key-123";
    const configPath = writeConfig("~/.cursor/hooks/airs-scan.log");
    expect(resolveLogPath(configPath)).toBe(
      join(homedir(), ".cursor", "hooks", "airs-scan.log"),
    );
  });

  it("resolveLogPath falls back to defaultLogPath when config is not loadable", () => {
    delete process.env.PRISMA_AIRS_API_KEY;
    const configPath = writeConfig("/custom/scan.log");
    expect(resolveLogPath(configPath)).toBe(defaultLogPath());
  });
});
