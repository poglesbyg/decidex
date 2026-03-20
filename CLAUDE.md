# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**decidex** — captures engineering decisions from git history and surfaces them in CLAUDE.md so AI coding tools never forget them.

## Commands

```bash
npm run build        # tsc -b (respects project reference ordering: core → cli)
npm test             # run all tests (vitest, 38 tests in packages/core)
npm run clean        # delete dist/ in all packages

# Per-package
npm run build -w packages/core
npm run test  -w packages/core

# Single test file
cd packages/core && npx vitest run src/decision-store.test.ts
```

## Architecture

```
decidex/
├── packages/
│   ├── core/          @decidex/core — all business logic (no CLI deps)
│   │   └── src/
│   │       ├── types.ts            Decision type, DECISION_SCHEMA_VERSION, GenerateOptions
│   │       ├── decision-store.ts   Read/write .decisions/ directory
│   │       ├── claude-md-merge.ts  Merge decisions into CLAUDE.md
│   │       ├── git-classifier.ts   LLM classification pipeline
│   │       ├── secret-scanner.ts   Pre-commit secret detection
│   │       ├── state-store.ts      Persist last-run commit hash (.decidex/state.json)
│   │       ├── tool-injector.ts    Write decisions to Cursor/Copilot/Windsurf context files
│   │       └── index.ts            Re-exports
│   ├── cli/           decidex binary
│   │   └── src/
│   │       ├── main.ts      commander entry point (generate, stats, scan)
│   │       ├── generate.ts  generate command + watch mode orchestration
│   │       ├── stats.ts     stats command
│   │       └── git.ts       git utilities (getCommits, getCommitsSince, getHeadCommit, etc.)
│   └── mcp/           @decidex/mcp — MCP server for Claude Code
│       └── src/
│           └── index.ts     MCP server: get_decisions + get_stats tools
└── tsconfig.json      root project references (core → cli, core → mcp)
```

## Key Design Decisions

**Decision store format** — `.decisions/{area}/{uuid}.md` with YAML frontmatter. Body is `text\n\n**Rationale:** ...`. Parse with `parseDecision()`, write with `writeDecision()` (atomic).

**CLAUDE.md markers** — `<!-- decidex:start -->` / `<!-- decidex:end -->` are a public API. Never rename without a migration. Three states: created (no file), updated (markers present), prepended (file exists, no markers).

**ClassifierInterface** — injectable for testing. `ClaudeAPIClassifier` uses `claude-3-5-haiku-20241022`. `OllamaClassifier` uses local Ollama REST. Tests use `mockClassifier()` vitest mocks.

**Batch size** — 500 commits per API call. Retries once per batch. Atomic: collects ALL results before writing anything.

**Pre-filter** — commits with `subject + body < 20 chars` are skipped. Skip count is reported.

**Atomic writes** — `atomicWrite()` in claude-md-merge and tool-injector writes temp file in the SAME directory as target (not os.tmpdir), then renames. Guarantees same-filesystem rename.

**Incremental runs** — `state-store.ts` persists `lastCommitHash` in `.decidex/state.json`. If state exists and `--since` is not passed, `generate` uses `getCommitsSince()` to classify only new commits. Resets to full scan if `--since` is explicitly passed.

**Tool injector** — writes decisions to `.cursor/rules/decidex.mdc`, `.github/copilot-instructions.md`, `.windsurfrules`. Same marker-based merge as CLAUDE.md. Activated via `decidex generate --tools cursor,copilot,windsurf`.

**MCP server** — `packages/mcp/` exposes `get_decisions(area, limit?)` and `get_stats()` tools via stdio transport. Add to Claude Code config with `"command": "decidex-mcp", "args": ["--repo", "/path/to/project"]`.

## Testing

Tests live in `packages/core/src/*.test.ts`. Run with `vitest`. No test files in `packages/cli` (integration tested manually).

Use `mockClassifier(decisions)` from the test helpers pattern to inject decisions without hitting the API.
