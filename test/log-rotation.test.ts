import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { rotateIfNeeded, forceRotate } from "../src/log-rotation.js";

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

describe("forceRotate", () => {
  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("rotates regardless of size and shifts prior rotations", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(LOG_PATH, "current");
    writeFileSync(`${LOG_PATH}.1`, "older");

    expect(forceRotate(LOG_PATH)).toBe(true);

    expect(existsSync(LOG_PATH)).toBe(false);
    expect(readFileSync(`${LOG_PATH}.1`, "utf-8")).toBe("current");
    expect(readFileSync(`${LOG_PATH}.2`, "utf-8")).toBe("older");
  });

  it("returns false when no log exists", () => {
    expect(forceRotate(LOG_PATH)).toBe(false);
  });
});
