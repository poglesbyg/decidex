import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeDecision,
  getDecisions,
  getStoreStats,
  validateArea,
  serializeDecision,
  parseDecision,
  type Decision,
} from "./decision-store.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decidex-store-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const BASE_DECISION: Decision = {
  id: "test-uuid-1234",
  version: 1,
  author: "Alice",
  timestamp: "2026-01-01T00:00:00Z",
  area: "src/auth/",
  confidence: 4,
  tags: ["auth", "security"],
  text: "Use JWT for authentication, not sessions",
  rationale: "Stateless, scales better",
  source: "generate",
};

describe("serializeDecision / parseDecision", () => {
  it("round-trips a decision", () => {
    const serialized = serializeDecision(BASE_DECISION);
    const parsed = parseDecision(serialized, "test.md");
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(BASE_DECISION.id);
    expect(parsed!.author).toBe(BASE_DECISION.author);
    expect(parsed!.area).toBe(BASE_DECISION.area);
    expect(parsed!.confidence).toBe(BASE_DECISION.confidence);
    expect(parsed!.tags).toEqual(BASE_DECISION.tags);
  });

  it("returns null for invalid frontmatter", () => {
    const result = parseDecision("no frontmatter here", "bad.md");
    expect(result).toBeNull();
  });
});

describe("writeDecision", () => {
  it("writes decision file and creates directories", () => {
    writeDecision(tmpDir, BASE_DECISION);
    const filePath = path.join(tmpDir, ".decisions", "src/auth/", "test-uuid-1234.md");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("file content is parseable", () => {
    writeDecision(tmpDir, BASE_DECISION);
    const filePath = path.join(tmpDir, ".decisions", "src/auth/", "test-uuid-1234.md");
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = parseDecision(content, filePath);
    expect(parsed).not.toBeNull();
    expect(parsed!.text).toBe(BASE_DECISION.text);
  });
});

describe("getDecisions", () => {
  it("returns empty array when .decisions/ does not exist", () => {
    const result = getDecisions(tmpDir, "src/");
    expect(result).toEqual([]);
  });

  it("returns decisions matching area prefix", () => {
    writeDecision(tmpDir, BASE_DECISION);
    writeDecision(tmpDir, { ...BASE_DECISION, id: "other-1", area: "src/api/" });

    const result = getDecisions(tmpDir, "src/");
    expect(result.length).toBe(2);
  });

  it("returns only decisions matching narrower area", () => {
    writeDecision(tmpDir, BASE_DECISION); // src/auth/
    writeDecision(tmpDir, { ...BASE_DECISION, id: "other-1", area: "src/api/" });

    const result = getDecisions(tmpDir, "src/auth/");
    expect(result.length).toBe(1);
    expect(result[0].area).toBe("src/auth/");
  });

  it("caps at limit (default 10)", () => {
    for (let i = 0; i < 15; i++) {
      writeDecision(tmpDir, {
        ...BASE_DECISION,
        id: `id-${i}`,
        timestamp: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      });
    }
    const result = getDecisions(tmpDir, "src/auth/");
    expect(result.length).toBe(10);
  });

  it("sorts by timestamp descending", () => {
    writeDecision(tmpDir, { ...BASE_DECISION, id: "old", timestamp: "2025-01-01T00:00:00Z" });
    writeDecision(tmpDir, { ...BASE_DECISION, id: "new", timestamp: "2026-06-01T00:00:00Z" });

    const result = getDecisions(tmpDir, "src/auth/");
    expect(result[0].id).toBe("new");
    expect(result[1].id).toBe("old");
  });
});

describe("getStoreStats", () => {
  it("returns zero stats when no .decisions/ directory", () => {
    const stats = getStoreStats(tmpDir);
    expect(stats.total).toBe(0);
    expect(stats.byArea).toEqual({});
  });

  it("counts decisions correctly", () => {
    writeDecision(tmpDir, BASE_DECISION);
    writeDecision(tmpDir, { ...BASE_DECISION, id: "id-2", area: "src/api/" });
    writeDecision(tmpDir, { ...BASE_DECISION, id: "id-3", area: "src/auth/" });

    const stats = getStoreStats(tmpDir);
    expect(stats.total).toBe(3);
    expect(stats.byArea["src/auth/"]).toBe(2);
    expect(stats.byArea["src/api/"]).toBe(1);
  });
});

describe("validateArea", () => {
  it("accepts relative paths", () => {
    expect(validateArea("src/auth/").valid).toBe(true);
    expect(validateArea("").valid).toBe(true);
  });

  it("rejects absolute paths", () => {
    expect(validateArea("/etc/passwd").valid).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(validateArea("../../../etc").valid).toBe(false);
  });
});
