import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { injectDecisions } from "./tool-injector.js";

const MARKER_START = "<!-- decidex:start -->";
const MARKER_END = "<!-- decidex:end -->";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decidex-inject-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const DECISIONS = ["Use Zod for validation", "No Passport.js — use JWT"];

describe("injectDecisions — cursor", () => {
  it("creates .cursor/rules/decidex.mdc with frontmatter on first run", () => {
    injectDecisions(tmpDir, DECISIONS, ["cursor"]);
    const p = path.join(tmpDir, ".cursor", "rules", "decidex.mdc");
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain("alwaysApply: true");
    expect(content).toContain(MARKER_START);
    expect(content).toContain("Use Zod for validation");
  });

  it("updates existing decidex section without touching frontmatter", () => {
    injectDecisions(tmpDir, DECISIONS, ["cursor"]);
    const result = injectDecisions(tmpDir, ["New decision"], ["cursor"]);
    expect(result[0].state).toBe("updated");
    const content = fs.readFileSync(result[0].filePath, "utf8");
    expect(content).toContain("New decision");
    expect(content).not.toContain("Use Zod for validation");
    expect(content).toContain("alwaysApply: true"); // frontmatter preserved
  });
});

describe("injectDecisions — copilot", () => {
  it("creates .github/copilot-instructions.md on first run", () => {
    injectDecisions(tmpDir, DECISIONS, ["copilot"]);
    const p = path.join(tmpDir, ".github", "copilot-instructions.md");
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain(MARKER_START);
    expect(content).toContain("No Passport.js — use JWT");
  });

  it("prepends to existing file without markers", () => {
    const p = path.join(tmpDir, ".github", "copilot-instructions.md");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "# Existing instructions\n\nKeep this.", "utf8");

    const result = injectDecisions(tmpDir, DECISIONS, ["copilot"]);
    expect(result[0].state).toBe("prepended");
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain("Existing instructions");
    expect(content).toContain("Use Zod for validation");
    expect(content.indexOf(MARKER_START)).toBeLessThan(content.indexOf("Existing instructions"));
  });

  it("replaces only decidex section when markers present", () => {
    const p = path.join(tmpDir, ".github", "copilot-instructions.md");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      `# My instructions\n\n${MARKER_START}\nOld content\n${MARKER_END}\n\nKeep this.`,
      "utf8"
    );
    injectDecisions(tmpDir, ["New decision"], ["copilot"]);
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain("New decision");
    expect(content).not.toContain("Old content");
    expect(content).toContain("Keep this.");
    expect(content).toContain("# My instructions");
  });
});

describe("injectDecisions — windsurf", () => {
  it("creates .windsurfrules on first run", () => {
    injectDecisions(tmpDir, DECISIONS, ["windsurf"]);
    const p = path.join(tmpDir, ".windsurfrules");
    expect(fs.existsSync(p)).toBe(true);
    const content = fs.readFileSync(p, "utf8");
    expect(content).toContain("Use Zod for validation");
  });
});

describe("injectDecisions — multiple targets", () => {
  it("writes all three targets and returns results for each", () => {
    const results = injectDecisions(tmpDir, DECISIONS);
    expect(results).toHaveLength(3);
    const targets = results.map((r) => r.target);
    expect(targets).toContain("cursor");
    expect(targets).toContain("copilot");
    expect(targets).toContain("windsurf");
    for (const r of results) {
      expect(r.state).toBe("created");
      expect(fs.existsSync(r.filePath)).toBe(true);
    }
  });

  it("handles empty decisions list", () => {
    const results = injectDecisions(tmpDir, [], ["copilot"]);
    const content = fs.readFileSync(results[0].filePath, "utf8");
    expect(content).toContain("No decisions captured yet");
  });

  it("leaves no .tmp files behind", () => {
    injectDecisions(tmpDir, DECISIONS, ["cursor"]);
    const tmpFiles = fs.readdirSync(path.join(tmpDir, ".cursor", "rules")).filter((f) =>
      f.endsWith(".tmp")
    );
    expect(tmpFiles).toHaveLength(0);
  });
});
