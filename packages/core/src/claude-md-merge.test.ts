import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { mergeCLAUDEMD } from "./claude-md-merge.js";

const MARKER_START = "<!-- decidex:start -->";
const MARKER_END = "<!-- decidex:end -->";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decidex-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("mergeCLAUDEMD", () => {
  it("creates file when none exists", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    const result = mergeCLAUDEMD(filePath, ["Use Zod for validation"]);
    expect(result.state).toBe("created");
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain(MARKER_START);
    expect(content).toContain(MARKER_END);
    expect(content).toContain("Use Zod for validation");
  });

  it("creates file with empty decisions (no decisions yet message)", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    mergeCLAUDEMD(filePath, []);
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("No decisions captured yet");
  });

  it("replaces only decidex section when markers present", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    const initial = `# My Project\n\n${MARKER_START}\n## Old decisions\n- Old decision\n${MARKER_END}\n\n## My custom section\n\nKeep this.`;
    fs.writeFileSync(filePath, initial);

    const result = mergeCLAUDEMD(filePath, ["New decision"]);
    expect(result.state).toBe("updated");

    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("New decision");
    expect(content).not.toContain("Old decision");
    expect(content).toContain("## My custom section");
    expect(content).toContain("Keep this.");
    expect(content).toContain("# My Project");
  });

  it("prepends decidex section when file exists without markers", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    const existing = "# Existing content\n\nUser maintained this.";
    fs.writeFileSync(filePath, existing);

    const result = mergeCLAUDEMD(filePath, ["Decision from generate"]);
    expect(result.state).toBe("prepended");
    expect(result.preserved).toBeGreaterThan(0);

    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("Decision from generate");
    expect(content).toContain("# Existing content");
    expect(content).toContain("User maintained this.");
    // decidex section must come before user content
    expect(content.indexOf(MARKER_START)).toBeLessThan(content.indexOf("# Existing content"));
  });

  it("is atomic — no partial writes", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    mergeCLAUDEMD(filePath, ["decision"]);
    // Verify no .tmp file left behind in the target directory
    const tmpFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });
});
