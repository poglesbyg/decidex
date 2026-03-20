import * as fs from "node:fs";
import * as path from "node:path";

const STATE_DIR = ".decidex";
const STATE_FILE = "state.json";

export interface DecidexState {
  /** SHA of the last commit that was classified. */
  lastCommitHash: string;
  /** ISO timestamp of the last successful generate run. */
  lastRunAt: string;
  /** How many decisions have been captured total. */
  totalDecisions: number;
}

function statePath(repoRoot: string): string {
  return path.join(repoRoot, STATE_DIR, STATE_FILE);
}

/** Read persisted state, or return null if no state file exists. */
export function readState(repoRoot: string): DecidexState | null {
  const p = statePath(repoRoot);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as DecidexState;
  } catch {
    return null;
  }
}

/** Write state atomically. */
export function writeState(repoRoot: string, state: DecidexState): void {
  const p = statePath(repoRoot);
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, ".state.tmp");
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);
}
