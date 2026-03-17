import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { rotateIfNeeded } from "../src/log-rotation.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-rotation-test");
const LOG_PATH = join(TMP_DIR, "test.log");

describe("rotateIfNeeded", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("does nothing when file is under 10MB", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(LOG_PATH, "small content");

    rotateIfNeeded(LOG_PATH);

    expect(existsSync(LOG_PATH)).toBe(true);
    expect(existsSync(`${LOG_PATH}.1`)).toBe(false);
  });

  it("does nothing when file does not exist", () => {
    rotateIfNeeded(LOG_PATH); // should not throw
  });

  it("rotates when file exceeds 10MB", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    // Write > 10MB
    const bigContent = "x".repeat(11 * 1024 * 1024);
    writeFileSync(LOG_PATH, bigContent);

    rotateIfNeeded(LOG_PATH);

    expect(existsSync(`${LOG_PATH}.1`)).toBe(true);
    expect(existsSync(LOG_PATH)).toBe(false); // original was renamed
  });
});
