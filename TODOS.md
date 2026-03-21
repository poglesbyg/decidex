# TODOS

## Phase 1b + Polish — SHIPPED ✓

- ✓ Ollama model quality warning — `checkOllamaModels()` in `git-classifier.ts`
- ✓ `decidex generate --watch` mode — incremental via `.decidex/state.json` + poll loop
- ✓ Multi-tool injection — `--tools cursor,copilot,windsurf` writes to tool context files
- ✓ MCP server — `packages/mcp/` with `get_decisions` and `get_stats` tools
- ✓ `decidex capture` command — manual decision authoring
- ✓ `decidex init` command — hooks + MCP config (Claude Code + Claude Desktop)
- ✓ Post-commit hook — auto-runs `decidex generate --yes` after each commit
- ✓ GitHub Actions CI — `.github/workflows/test.yml` (Node 20 + 22)
- ✓ README.md — install, quickstart, all commands, MCP setup, multi-tool injection

---

## Landing Page

### Light Mode
**What:** Implement `[data-theme="light"]` CSS variable swap on the landing page, with a toggle button in the nav.
**Why:** DESIGN.md fully specifies the light palette — it's implementation-ready. Deferred to keep initial launch scope tight.
**Pros:** Respects `prefers-color-scheme: light` OS preference; feels polished.
**Cons:** Amber on light background needs careful contrast checking (4.8:1 only passes AA at large text).
**Context:** CLI tool audience skews dark-mode. This is polish, not table stakes. Build after landing page ships and gets first users.
**Effort:** S (human: half day / CC: 15 min)
**Depends on:** Landing page must ship first

---

## P2 — Phase 2 Work

### Conflict Detection for Team Decisions
**What:** When `captureDecision()` is called and an existing decision for the same area contradicts it, warn the user.
**Why:** Without this, teams silently accumulate conflicting decisions and the AI gets confused about which to follow.
**Pros:** Prevents decision drift, makes team alignment visible.
**Cons:** Requires semantic comparison (LLM call or embedding similarity). Adds latency to `captureDecision`.
**Context:** Phase 1 users are solo so conflict is rare. Build after you have team users. Will need the embeddings work (see below) to do comparison cheaply.
**Effort:** M (human: 2 weeks / CC: 1 hour)
**Depends on:** Team multiplayer features, vector embedding upgrade

---

### Vector Embedding Upgrade for Decision Retrieval
**What:** Replace directory prefix match with semantic vector search. Store embeddings alongside each decision. Retrieve top-k by cosine similarity to current file/context.
**Why:** Directory prefix match misses decisions that are conceptually related but in different directories. Example: "never use callbacks" lives in `src/utils/` but is relevant to `src/api/`.
**Pros:** Much higher relevance accuracy. Decisions from anywhere surface when appropriate.
**Cons:** Requires embedding model (local or API). Adds storage overhead. More complex.
**Context:** Build after you have 50+ decisions per repo to validate the improvement over prefix matching. The decision file format already stores `tags` which can seed the embedding metadata.
**Effort:** M (human: 3 weeks / CC: 2 hours)
**Depends on:** None (can be done independently of team features)

---

### Phase 3 — Cloud Sync for Teams
**What:** Hosted team sync — decisions in the cloud, shared across machines and team members who don't share a git repo.
**Why:** The OSS/git approach works for teams that share a repo. Consultants, cross-functional teams, and personal standards across client projects need cloud sync.
**Pros:** Revenue model unlock. Network effects at scale.
**Cons:** Auth, billing, privacy compliance, trust barrier.
**Context:** Build after the OSS core has 500+ users and you understand the team use cases.
**Effort:** XL (human: 3 months / CC: 3 days)
**Depends on:** OSS traction, business model validation
