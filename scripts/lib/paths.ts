import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig } from "../../src/config.js";

/** Default scan-log location when no config is loadable */
export function defaultLogPath(): string {
  return join(homedir(), ".cursor", "hooks", "airs-scan.log");
}

/** Global (user-level) config location — the doctor's create target */
export function globalConfigPath(): string {
  return join(homedir(), ".cursor", "hooks", "airs-config.json");
}

/**
 * Resolve the `.cursor` directory for the requested scope.
 *   global  → ~/.cursor      (applies to all workspaces)
 *   project → <cwd>/.cursor  (this workspace only)
 */
export function cursorDir(isGlobal: boolean): string {
  return isGlobal ? join(homedir(), ".cursor") : join(process.cwd(), ".cursor");
}

/**
 * Resolve the scan-log path from the AIRS config (with `~` already expanded),
 * falling back to the global default when no config can be loaded.
 */
export function resolveLogPath(configPath?: string): string {
  try {
    return loadConfig(configPath).logging.path;
  } catch {
    return defaultLogPath();
  }
}
