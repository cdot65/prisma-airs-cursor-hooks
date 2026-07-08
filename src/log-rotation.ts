import { existsSync, statSync, renameSync, unlinkSync } from "node:fs";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ROTATIONS = 5;

/** Shift log → log.1 → log.2 … log.5 (oldest dropped) */
function shiftRotations(logPath: string): void {
  for (let i = MAX_ROTATIONS; i >= 1; i--) {
    const from = i === 1 ? logPath : `${logPath}.${i - 1}`;
    const to = `${logPath}.${i}`;
    if (existsSync(from)) {
      if (i === MAX_ROTATIONS && existsSync(to)) {
        unlinkSync(to);
      }
      renameSync(from, to);
    }
  }
}

/** Rotate log file if it exceeds MAX_SIZE_BYTES */
export function rotateIfNeeded(logPath: string): void {
  try {
    if (!existsSync(logPath)) return;
    const stat = statSync(logPath);
    if (stat.size < MAX_SIZE_BYTES) return;
    shiftRotations(logPath);
  } catch {
    // Never crash on rotation failure
  }
}

/**
 * Rotate the log file immediately, regardless of size.
 * Returns true when a rotation happened (false when no log file exists).
 */
export function forceRotate(logPath: string): boolean {
  if (!existsSync(logPath)) return false;
  shiftRotations(logPath);
  return true;
}
