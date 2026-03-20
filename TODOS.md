# TODOS

## Phase 1b — Next Engineering Work

### Ollama Model Quality Warning (added from eng review)
**What:** On first `--local` run, check available Ollama models, recommend `llama3:8b` minimum, warn if only smaller/weaker models are installed.
**Why:** Ollama quality varies wildly by model. A user with `mistral:7b` will see poor decision extraction and blame decidex.
**Pros:** Prevents churn from bad first impressions of `--local` mode. Could auto-select best available model.
**Cons:** Adds complexity to the `--local` path.
**Context:** Check `ollama list` output, parse model names, warn if nothing >= recommended tier.
**Effort:** S (human: 1 day / CC: 20min)
**Depends on:** `--local` flag shipped in Phase 1

---

### `decidex generate --watch` mode
**What:** Watch the git repo for new commits and re-run classification incrementally (only new commits since last run).
**Why:** Zero-friction ongoing CLAUDE.md updates without remembering to run manually. Also enables a git post-commit hook integration.
**Pros:** Viral — users see it updating automatically and share with teammates. Incremental classification is also needed for the large-repo batching anyway.
**Cons:** Long-running process. Background failures need visible error reporting.
**Context:** Requires storing a "last classified commit hash" in `.decidex/state.json`. fswatch or `chokidar` for file watching.
**Effort:** S (human: 2 days / CC: 20min)
**Depends on:** Phase 1 generate command shipped

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
