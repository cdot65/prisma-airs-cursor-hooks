import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ScanLogEntry } from "./types.js";
import { rotateIfNeeded } from "./log-rotation.js";

/** Structured JSON Lines logger — appends one JSON object per line */
export class Logger {
  private logPath: string;
  private includeContent: boolean;
  private writeCount = 0;

  constructor(logPath: string, includeContent = false) {
    this.logPath = logPath;
    this.includeContent = includeContent;
  }

  /** Log a scan result entry */
  logScan(entry: Omit<ScanLogEntry, "timestamp">): void {
    const full: ScanLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Strip content field unless debug mode
    if (!this.includeContent) {
      delete full.content;
    }

    this.write(full);
  }

  /** Log a generic event */
  logEvent(event: string, data: Record<string, unknown> = {}): void {
    this.write({
      timestamp: new Date().toISOString(),
      event,
      ...data,
    });
  }

  private write(entry: object): void {
    try {
      // Check for log rotation every 100 writes to avoid stat() overhead
      this.writeCount++;
      if (this.writeCount % 100 === 0) {
        rotateIfNeeded(this.logPath);
      }

      mkdirSync(dirname(this.logPath), { recursive: true });
      appendFileSync(this.logPath, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
      // Never crash the hook on log failure
    }
  }
}
