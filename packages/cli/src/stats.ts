import { getStoreStats } from "@decidex/core";
import { isGitRepo, getRepoRoot } from "./git.js";

/** Render the stats command output. */
export function runStats(cwd: string): void {
  if (!isGitRepo(cwd)) {
    console.error("✗ Not a git repo. Run from your project root.");
    process.exitCode = 1;
    return;
  }

  const repoRoot = getRepoRoot(cwd);
  const stats = getStoreStats(repoRoot);

  if (stats.total === 0) {
    console.log("No decisions captured yet.");
    console.log('Run "decidex generate" to extract decisions from your git history.');
    return;
  }

  console.log(`\n📊  decidex stats for ${repoRoot.split("/").pop()}\n`);
  console.log(`Total decisions: ${stats.total}`);

  if (stats.oldestTimestamp && stats.newestTimestamp) {
    const oldest = new Date(stats.oldestTimestamp).toLocaleDateString();
    const newest = new Date(stats.newestTimestamp).toLocaleDateString();
    console.log(`Date range:      ${oldest} → ${newest}`);
  }

  if (Object.keys(stats.byArea).length > 0) {
    console.log("\nBy area:");
    const sorted = Object.entries(stats.byArea).sort((a, b) => b[1] - a[1]);
    for (const [area, count] of sorted.slice(0, 10)) {
      const displayArea = area || "(repo-wide)";
      console.log(`  ${displayArea.padEnd(30)} ${count}`);
    }
    if (sorted.length > 10) {
      console.log(`  … and ${sorted.length - 10} more areas`);
    }
  }

  if (stats.recentDecisions.length > 0) {
    console.log("\nMost recent decisions:");
    for (const d of stats.recentDecisions) {
      const date = new Date(d.timestamp).toLocaleDateString();
      const area = d.area ? `[${d.area}]` : "";
      const preview = d.text.slice(0, 70) + (d.text.length > 70 ? "…" : "");
      console.log(`  ${date} ${area} ${preview}`);
    }
  }
  console.log();
}
