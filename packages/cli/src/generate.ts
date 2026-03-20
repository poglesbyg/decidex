import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  ClaudeAPIClassifier,
  OllamaClassifier,
  classifyCommits,
  checkOllamaModels,
  estimateCost,
  mergeCLAUDEMD,
  installPreCommitHook,
  writeDecision,
  newDecisionId,
  type ClassifierInterface,
  type GenerateOptions,
} from "@decidex/core";
import { getCommits, getRepoRoot, getRepoName, getGitAuthor, isGitRepo } from "./git.js";

/** Run the generate command end-to-end. */
export async function runGenerate(
  cwd: string,
  opts: GenerateOptions,
  /** Injectable classifier for testing */
  classifierOverride?: ClassifierInterface
): Promise<void> {
  // 1. Validate git repo
  if (!isGitRepo(cwd)) {
    console.error("✗ Not a git repo. Run from your project root.");
    process.exitCode = 1;
    return;
  }

  const repoRoot = getRepoRoot(cwd);
  const repoName = getRepoName(repoRoot);
  const author = getGitAuthor(repoRoot);

  // 2. Fetch commits
  const since = opts.since ?? "90d";
  console.log(`→ Reading git history (--since=${since})…`);
  const commits = getCommits(repoRoot, since);

  if (commits.length === 0) {
    console.log("No git history found. Creating minimal CLAUDE.md template.");
    const claudeMD = path.join(repoRoot, ".claude", "CLAUDE.md");
    mergeCLAUDEMD(claudeMD, []);
    console.log(`✓ Created ${claudeMD}`);
    return;
  }

  // 3. Cost estimate
  const { usd } = estimateCost(commits.length);
  const preFilterSkip = commits.filter((c) => (c.subject + c.body).trim().length < 20).length;
  const analyzable = commits.length - preFilterSkip;

  console.log(
    `→ Found ${commits.length} commits (${preFilterSkip} too short to classify, ${analyzable} to analyze)`
  );

  if (!opts.dryRun && !opts.yes && !opts.local) {
    console.log(`→ Estimated Claude API cost: ${usd}`);
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question("Proceed? [Y/n] ");
    rl.close();
    if (answer.toLowerCase() === "n") {
      console.log("Aborted. Tip: use --local to run with Ollama (free, private).");
      return;
    }
  }

  if (opts.dryRun) {
    console.log(`Dry run complete. ${analyzable} commits would be analyzed. Cost: ${usd}`);
    return;
  }

  // 4. Build classifier
  let classifier = classifierOverride;
  if (!classifier) {
    if (opts.local) {
      const ollamaUrl = "http://localhost:11434";
      let model = opts.ollamaModel;
      if (!model) {
        console.log("→ Checking available Ollama models…");
        const { model: detected, warning } = await checkOllamaModels(ollamaUrl).catch((err) => {
          console.error(`✗ ${err.message}`);
          process.exitCode = 1;
          throw err;
        });
        if (warning) console.warn(`⚠  ${warning}`);
        model = detected;
      }
      console.log(`→ Using Ollama model: ${model}`);
      classifier = new OllamaClassifier(model, ollamaUrl);
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error(
          "✗ ANTHROPIC_API_KEY is not set.\n" +
          "  Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n" +
          "  Or use --local to run with Ollama (no API key needed)."
        );
        process.exitCode = 1;
        return;
      }
      classifier = new ClaudeAPIClassifier(apiKey);
    }
  }

  // 5. Classify — atomic (collects all batches before writing anything)
  console.log("→ Classifying commits…");
  const result = await classifyCommits(commits, classifier, repoName);

  if (result.batchErrors.length > 0) {
    console.warn(`⚠  ${result.batchErrors.length} batch(es) failed:`);
    result.batchErrors.forEach((e) => console.warn(`   ${e}`));
    if (result.decisions.length === 0) {
      console.error("✗ All batches failed. No decisions extracted.");
      process.exitCode = 1;
      return;
    }
    console.warn(`   Continuing with ${result.decisions.length} decisions from successful batches.`);
  }

  if (result.skippedCount > 0) {
    console.log(`→ Skipped ${result.skippedCount} commits (message too short).`);
  }

  // 6. Write decisions to .decisions/
  const timestamp = new Date().toISOString();
  for (const d of result.decisions) {
    writeDecision(repoRoot, {
      id: newDecisionId(),
      version: 1,
      author,
      timestamp,
      area: d.area,
      confidence: d.confidence,
      tags: d.tags,
      text: d.text,
      rationale: d.rationale,
      source: "generate",
    });
  }

  console.log(`✓ Captured ${result.decisions.length} decisions → .decisions/`);

  // 7. Update CLAUDE.md
  const claudeMDPath = path.join(repoRoot, ".claude", "CLAUDE.md");
  const decisionSummaries = result.decisions
    .slice(0, 20)
    .map((d) => d.text);

  const mergeResult = mergeCLAUDEMD(claudeMDPath, decisionSummaries);
  const stateMsg =
    mergeResult.state === "created"
      ? "Created"
      : mergeResult.state === "updated"
      ? "Updated"
      : "Prepended to";
  console.log(`✓ ${stateMsg} ${claudeMDPath}`);

  // 8. Install pre-commit hook
  try {
    installPreCommitHook(repoRoot);
    console.log("✓ Secret scanner pre-commit hook installed");
  } catch (err) {
    console.warn(`⚠  Could not install pre-commit hook: ${(err as Error).message}`);
  }

  console.log("\n✓ Done! Your AI tools now know your engineering decisions.");
  console.log('  Run "decidex stats" to see what was captured.');
  if (!opts.local) {
    console.log("  Tip: add --local to use Ollama for free private classification.");
  }
}
