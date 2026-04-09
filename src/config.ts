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
