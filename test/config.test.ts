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
