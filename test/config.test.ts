import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-config-test");

function writeConfig(overrides: Record<string, unknown> = {}) {
  const base = {
    endpoint: "https://us-east1.api.prismacloud.io",
    apiKeyEnvVar: "AIRS_API_KEY",
    profiles: { prompt: "prompt-profile", response: "response-profile" },
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
    process.env.AIRS_API_KEY = "test-key-123";
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    delete process.env.AIRS_API_KEY;
  });

  it("loads valid config", () => {
    const path = writeConfig();
    const config = loadConfig(path);
    expect(config.mode).toBe("observe");
    expect(config.profiles.prompt).toBe("prompt-profile");
  });

  it("rejects invalid mode", () => {
    const path = writeConfig({ mode: "yolo" });
    expect(() => loadConfig(path)).toThrow('Invalid mode "yolo"');
  });

  it("rejects missing API key env var", () => {
    delete process.env.AIRS_API_KEY;
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
    process.env.AIRS_API_ENDPOINT = "https://eu-west1.api.prismacloud.io";
    const path = writeConfig({ endpoint: "${AIRS_API_ENDPOINT}" });
    const config = loadConfig(path);
    expect(config.endpoint).toBe("https://eu-west1.api.prismacloud.io");
    delete process.env.AIRS_API_ENDPOINT;
  });

  it("defaults endpoint when env var is unset", () => {
    delete process.env.AIRS_API_ENDPOINT;
    const path = writeConfig({ endpoint: "${AIRS_API_ENDPOINT}" });
    const config = loadConfig(path);
    expect(config.endpoint).toBe("https://service.api.aisecurity.paloaltonetworks.com");
  });

  it("defaults profile names when env vars are unset", () => {
    const path = writeConfig({
      profiles: { prompt: "${AIRS_PROMPT_PROFILE}", response: "${AIRS_RESPONSE_PROFILE}" },
    });
    const config = loadConfig(path);
    expect(config.profiles.prompt).toBe("cursor-ide-prompt-profile");
    expect(config.profiles.response).toBe("cursor-ide-response-profile");
  });

  it("resolves profile env vars when set", () => {
    process.env.AIRS_PROMPT_PROFILE = "custom-prompt";
    process.env.AIRS_RESPONSE_PROFILE = "custom-response";
    const path = writeConfig({
      profiles: { prompt: "${AIRS_PROMPT_PROFILE}", response: "${AIRS_RESPONSE_PROFILE}" },
    });
    const config = loadConfig(path);
    expect(config.profiles.prompt).toBe("custom-prompt");
    expect(config.profiles.response).toBe("custom-response");
    delete process.env.AIRS_PROMPT_PROFILE;
    delete process.env.AIRS_RESPONSE_PROFILE;
  });

  it("rejects invalid JSON", () => {
    const path = join(TMP_DIR, "airs-config.json");
    writeFileSync(path, "not json at all");
    expect(() => loadConfig(path)).toThrow("Invalid JSON");
  });
});
