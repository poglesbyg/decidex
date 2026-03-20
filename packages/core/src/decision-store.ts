import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { Decision, DECISION_SCHEMA_VERSION, StoreStats } from "./types.js";

const DECISIONS_DIR = ".decisions";

/** Frontmatter delimiter used in decision files. */
const FM_DELIM = "---";

/** Serialize a Decision to markdown with YAML frontmatter. */
export function serializeDecision(d: Decision): string {
  const fm = [
    FM_DELIM,
    `id: ${d.id}`,
    `version: ${d.version}`,
    `author: ${d.author}`,
    `timestamp: ${d.timestamp}`,
    `area: ${d.area}`,
    `confidence: ${d.confidence}`,
    `tags: [${d.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
    `source: ${d.source}`,
    FM_DELIM,
    "",
    d.text,
  ];
  if (d.rationale) {
    fm.push("", `**Rationale:** ${d.rationale}`);
  }
  return fm.join("\n");
}

/** Parse a decision markdown file back into a Decision object. */
export function parseDecision(content: string, filePath: string): Decision | null {
  try {
    const lines = content.split("\n");
    if (lines[0] !== FM_DELIM) return null;

    const endIdx = lines.indexOf(FM_DELIM, 1);
    if (endIdx === -1) return null;

    const fmLines = lines.slice(1, endIdx);
    const body = lines.slice(endIdx + 2).join("\n").trim();

    const fm: Record<string, string> = {};
    for (const line of fmLines) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      fm[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }

    const tags = fm.tags
      ? fm.tags
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((t) => t.trim().replace(/^"|"$/g, ""))
          .filter(Boolean)
      : [];

    // Separate decision text from optional rationale section
    const rationaleMarker = "\n\n**Rationale:**";
    const rationaleIdx = body.indexOf(rationaleMarker);
    const text = rationaleIdx !== -1 ? body.slice(0, rationaleIdx).trim() : body;
    const rationale = rationaleIdx !== -1 ? body.slice(rationaleIdx + rationaleMarker.length).trim() : undefined;

    return {
      id: fm.id,
      version: parseInt(fm.version ?? "1", 10),
      author: fm.author ?? "",
      timestamp: fm.timestamp ?? "",
      area: fm.area ?? "",
      confidence: (parseInt(fm.confidence ?? "3", 10) as Decision["confidence"]),
      tags,
      text,
      rationale,
      source: (fm.source as Decision["source"]) ?? "generate",
    };
  } catch {
    console.warn(`[decidex] Failed to parse decision file: ${filePath}`);
    return null;
  }
}

/** Generate a unique ID for a decision. */
export function newDecisionId(): string {
  return crypto.randomUUID();
}

/** Return the file path for a decision, relative to repo root. */
export function decisionFilePath(repoRoot: string, area: string, id: string): string {
  // Sanitize area to a safe directory path
  const safeArea = area.replace(/^\//, "").replace(/\.\.\//g, "");
  return path.join(repoRoot, DECISIONS_DIR, safeArea, `${id}.md`);
}

/** Write a decision to disk atomically (write to temp, rename). */
export function writeDecision(repoRoot: string, decision: Decision): void {
  const filePath = decisionFilePath(repoRoot, decision.area, decision.id);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const content = serializeDecision(decision);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

/** Read all decisions from the .decisions/ directory, matching a directory prefix. */
export function getDecisions(repoRoot: string, area: string, limit = 10): Decision[] {
  const decisionsRoot = path.join(repoRoot, DECISIONS_DIR);
  if (!fs.existsSync(decisionsRoot)) return [];

  const safeArea = area.replace(/^\//, "").replace(/\.\.\//g, "");
  const results: Decision[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        const content = fs.readFileSync(full, "utf8");
        const d = parseDecision(content, full);
        if (d && (safeArea === "" || d.area.startsWith(safeArea) || safeArea.startsWith(d.area))) {
          results.push(d);
        }
      }
    }
  }

  walk(decisionsRoot);

  // Sort by timestamp descending, return top `limit`
  return results
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

/** Return stats about the decision store. */
export function getStoreStats(repoRoot: string): StoreStats {
  const decisionsRoot = path.join(repoRoot, DECISIONS_DIR);
  if (!fs.existsSync(decisionsRoot)) {
    return { total: 0, byArea: {}, recentDecisions: [] };
  }

  const all: Decision[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        const d = parseDecision(fs.readFileSync(full, "utf8"), full);
        if (d) all.push(d);
      }
    }
  }

  walk(decisionsRoot);

  const byArea: Record<string, number> = {};
  for (const d of all) {
    byArea[d.area] = (byArea[d.area] ?? 0) + 1;
  }

  const sorted = [...all].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    total: all.length,
    byArea,
    recentDecisions: sorted.slice(0, 5),
    oldestTimestamp: all.length > 0
      ? all.sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0].timestamp
      : undefined,
    newestTimestamp: sorted[0]?.timestamp,
  };
}

/** Validate that an area path is safe (within repo root). */
export function validateArea(area: string): { valid: boolean; error?: string } {
  if (!area) return { valid: true }; // empty area = root
  if (path.isAbsolute(area)) return { valid: false, error: "Area must be a relative path" };
  if (area.includes("..")) return { valid: false, error: "Area must not contain '..'" };
  return { valid: true };
}
