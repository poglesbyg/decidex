import { execSync } from "node:child_process";
import { CommitEntry } from "@decidex/core";

/** Check whether cwd is inside a git repository. */
export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Get the repo root directory. */
export function getRepoRoot(cwd: string): string {
  return execSync("git rev-parse --show-toplevel", { cwd, stdio: "pipe" })
    .toString()
    .trim();
}

/** Get the repo name (last component of remote URL or directory name). */
export function getRepoName(repoRoot: string): string {
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: repoRoot,
      stdio: "pipe",
    })
      .toString()
      .trim();
    return remote.split("/").pop()?.replace(/\.git$/, "") ?? "unknown";
  } catch {
    return repoRoot.split("/").pop() ?? "unknown";
  }
}

/** Get git config user.name for authoring decisions. */
export function getGitAuthor(repoRoot: string): string {
  try {
    return execSync("git config user.name", { cwd: repoRoot, stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

/** Fetch commits from git log. Optionally filtered by --since. */
export function getCommits(repoRoot: string, since?: string): CommitEntry[] {
  const sinceArg = since ? `--since="${since}"` : "";
  // Format: <hash>\x1f<subject>\x1f<body>
  const format = "--format=%H%x1f%s%x1f%b%x1e";
  const cmd = `git log ${sinceArg} ${format}`.trim();

  let raw: string;
  try {
    raw = execSync(cmd, { cwd: repoRoot, stdio: "pipe", maxBuffer: 50 * 1024 * 1024 })
      .toString();
  } catch {
    return [];
  }

  return raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = "", subject = "", body = ""] = entry.split("\x1f");
      return { hash: hash.trim(), subject: subject.trim(), body: body.trim() };
    })
    .filter((c) => c.hash.length === 40); // valid SHA only
}
