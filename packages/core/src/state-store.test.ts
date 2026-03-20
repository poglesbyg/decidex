import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readState, writeState, type DecidexState } from "./state-store.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decidex-state-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const SAMPLE_STATE: DecidexState = {
  lastCommitHash: "abc123def456",
  lastRunAt: "2026-01-01T00:00:00Z",
  totalDecisions: 5,
};

describe("readState", () => {
  it("returns null when no state file exists", () => {
    expect(readState(tmpDir)).toBeNull();
  });

  it("reads state written by writeState", () => {
    writeState(tmpDir, SAMPLE_STATE);
    const result = readState(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.lastCommitHash).toBe("abc123def456");
    expect(result!.totalDecisions).toBe(5);
  });

  it("returns null for corrupted state file", () => {
    const stateDir = path.join(tmpDir, ".decidex");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "state.json"), "not json", "utf8");
    expect(readState(tmpDir)).toBeNull();
  });
});

describe("writeState", () => {
  it("creates .decidex/ directory if missing", () => {
    writeState(tmpDir, SAMPLE_STATE);
    expect(fs.existsSync(path.join(tmpDir, ".decidex", "state.json"))).toBe(true);
  });

  it("overwrites previous state", () => {
    writeState(tmpDir, SAMPLE_STATE);
    writeState(tmpDir, { ...SAMPLE_STATE, totalDecisions: 42 });
    const result = readState(tmpDir);
    expect(result!.totalDecisions).toBe(42);
  });

  it("writes valid JSON", () => {
    writeState(tmpDir, SAMPLE_STATE);
    const raw = fs.readFileSync(path.join(tmpDir, ".decidex", "state.json"), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
