#!/usr/bin/env node
import { Command } from "commander";
import { runGenerate, runWatch } from "./generate.js";
import { runStats } from "./stats.js";

const program = new Command();

program
  .name("decidex")
  .description("Capture engineering decisions so your AI tools never forget them")
  .version("0.1.0");

program
  .command("generate")
  .description("Analyze git history and generate CLAUDE.md with engineering decisions")
  .option("--since <duration>", "Only analyze commits since this date/duration (e.g. 90d, 2024-01-01)", "90d")
  .option("--yes", "Skip the cost confirmation prompt")
  .option("--local", "Use local Ollama model instead of Claude API (free, private)")
  .option("--model <name>", "Ollama model to use with --local (e.g. llama3, mistral)")
  .option("--dry-run", "Count commits and show cost estimate without calling the API")
  .option(
    "--tools <list>",
    "Also inject decisions into AI tool context files. Comma-separated: cursor,copilot,windsurf",
    (val: string) => val.split(",").map((s) => s.trim()).filter(Boolean)
  )
  .option("--watch", "Watch for new commits and re-classify incrementally (runs every 60s)")
  .action(async (opts) => {
    const options = {
      since: opts.since,
      yes: opts.yes,
      local: opts.local,
      ollamaModel: opts.model,
      dryRun: opts.dryRun,
      tools: opts.tools,
      watch: opts.watch,
    };

    if (opts.watch) {
      await runWatch(process.cwd(), options);
    } else {
      await runGenerate(process.cwd(), options);
    }
  });

program
  .command("stats")
  .description("Show a summary of captured engineering decisions")
  .action(() => {
    runStats(process.cwd());
  });

program
  .command("scan <file>")
  .description("Scan a decision file for secrets (used by the pre-commit hook)")
  .action((file: string) => {
    const { scanText } = require("@decidex/core");
    const fs = require("node:fs");
    const text = fs.readFileSync(file, "utf8");
    const result = scanText(text, process.cwd());
    if (!result.clean) {
      for (const f of result.findings) {
        console.log(`  Line ${f.line}: ${f.name} — ${f.excerpt}`);
      }
      process.exitCode = 1;
    }
  });

program.parse();
