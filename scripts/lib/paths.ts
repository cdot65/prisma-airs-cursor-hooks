import { join } from "node:path";
import { homedir } from "node:os";

/** Default scan-log location when no config is loadable */
export function defaultLogPath(): string {
  return join(homedir(), ".cursor", "hooks", "airs-scan.log");
}

/** Global (user-level) config location — the doctor's create target */
export function globalConfigPath(): string {
  return join(homedir(), ".cursor", "hooks", "airs-config.json");
}
