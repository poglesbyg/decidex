import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ClassifiedDecision, ClassifyResult } from "./types.js";

/*
 * Classification pipeline:
 *
 *  git log → pre-filter → chunk(500) → Claude API × N → merge → Zod validate
 *                │                          │
 *            [skip <20ch]             [retry on bad JSON]
 *                │                          │
 *            [show count]             [skip after 1 retry]
 */

/** Minimum commit message length to attempt classification. */
const MIN_COMMIT_LENGTH = 20;

/** Maximum commits per API batch (context window budget). */
const BATCH_SIZE = 500;

/** Recommended minimum Ollama model tier. */
const OLLAMA_MIN_MODEL = "llama3";

/** Zod schema for LLM classifier output. */
const ClassifierOutputSchema = z.object({
  decisions: z.array(
    z.object({
      area: z.string(),
      text: z.string().min(10),
      confidence: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
      rationale: z.string(),
      tags: z.array(z.string()),
    })
  ),
});

/** Injectable classifier interface — enables testing with mocks. */
export interface ClassifierInterface {
  classify(commits: CommitEntry[], repoName: string): Promise<ClassifiedDecision[]>;
}

export interface CommitEntry {
  hash: string;
  subject: string;
  body: string;
}

/** Build the classification prompt. */
function buildPrompt(commits: CommitEntry[], repoName: string): string {
  const commitText = commits
    .map((c) => `[${c.hash.slice(0, 7)}] ${c.subject}\n${c.body}`.trim())
    .join("\n\n---\n\n");

  return `You are analyzing git commit history for the repository "${repoName}" to extract architectural decisions.

Extract ONLY:
1. Technology choices and rejections ("uses Zod for validation, not Yup")
2. Architectural patterns ("REST API not GraphQL")
3. Constraints ("no external state management, React Context only")
4. Explicitly rejected approaches ("don't use Passport.js — adds complexity")
5. Framework or library decisions with clear rationale

Do NOT extract:
- Bug fixes without architectural implications
- Pure feature additions
- WIP commits, merge commits, version bumps
- Obvious/trivial decisions

For each decision:
- "area": the most specific relative directory path relevant to this decision (e.g. "src/auth/", "packages/api/", or "" for repo-wide)
- "text": the decision as a clear, imperative statement (e.g. "Use Zod for all request validation, not Yup or Joi")
- "confidence": 1-5 (5 = explicit clear decision, 1 = inferred from context)
- "rationale": why this decision was made (from commit context)
- "tags": 2-4 relevant tags

Return JSON only, no prose:
{"decisions": [...]}

COMMITS TO ANALYZE:

${commitText}`;
}

/** Claude API classifier. */
export class ClaudeAPIClassifier implements ClassifierInterface {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async classify(commits: CommitEntry[], repoName: string): Promise<ClassifiedDecision[]> {
    const prompt = buildPrompt(commits, repoName);
    const response = await this.client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    return parseClassifierResponse(text);
  }
}

/** Ollama (local) classifier. */
export class OllamaClassifier implements ClassifierInterface {
  private model: string;
  private baseUrl: string;

  constructor(model: string, baseUrl = "http://localhost:11434") {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async classify(commits: CommitEntry[], repoName: string): Promise<ClassifiedDecision[]> {
    const prompt = buildPrompt(commits, repoName);
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { response: string };
    return parseClassifierResponse(data.response);
  }
}

/** Parse and validate the classifier JSON response with one retry on failure. */
function parseClassifierResponse(text: string): ClassifiedDecision[] {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in classifier response");

  const parsed = JSON.parse(jsonMatch[0]);
  const validated = ClassifierOutputSchema.parse(parsed);
  return validated.decisions;
}

/** Check available Ollama models and warn if below recommended tier. */
export async function checkOllamaModels(
  baseUrl = "http://localhost:11434"
): Promise<{ model: string; warning?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) throw new Error("Ollama not responding");

    const data = (await res.json()) as { models: Array<{ name: string }> };
    const models = data.models.map((m) => m.name);

    if (models.length === 0) {
      return {
        model: OLLAMA_MIN_MODEL,
        warning: `No Ollama models found. Run: ollama pull ${OLLAMA_MIN_MODEL}`,
      };
    }

    // Prefer larger models for better quality
    const preferred = models.find(
      (m) =>
        m.includes("llama3") ||
        m.includes("mistral-nemo") ||
        m.includes("mixtral") ||
        m.includes("qwen2")
    );

    if (!preferred) {
      return {
        model: models[0],
        warning: `For best results, use a model like llama3 or mistral-nemo. Currently available: ${models.slice(0, 3).join(", ")}. Run: ollama pull ${OLLAMA_MIN_MODEL}`,
      };
    }

    return { model: preferred };
  } catch (err) {
    throw new Error(
      `Cannot connect to Ollama at ${baseUrl}. Is it running? Start with: ollama serve`
    );
  }
}

/** Estimate the Claude API cost for classifying a set of commits. */
export function estimateCost(commitCount: number): { tokens: number; usd: string } {
  const avgTokensPerCommit = 150; // subject + body estimate
  const promptOverheadTokens = 800;
  const batches = Math.ceil(commitCount / BATCH_SIZE);
  const inputTokens = commitCount * avgTokensPerCommit + promptOverheadTokens * batches;
  const outputTokens = commitCount * 20; // estimated output per decision
  // claude-3-5-haiku pricing (approximate)
  const costUSD = (inputTokens / 1_000_000) * 0.8 + (outputTokens / 1_000_000) * 4.0;
  return {
    tokens: inputTokens + outputTokens,
    usd: costUSD < 0.01 ? "<$0.01" : `~$${costUSD.toFixed(2)}`,
  };
}

/**
 * Pre-filter commits: skip those with messages shorter than MIN_COMMIT_LENGTH.
 * Returns { filtered, skippedCount }.
 */
export function preFilterCommits(commits: CommitEntry[]): {
  filtered: CommitEntry[];
  skippedCount: number;
} {
  const filtered = commits.filter(
    (c) => (c.subject + c.body).trim().length >= MIN_COMMIT_LENGTH
  );
  return { filtered, skippedCount: commits.length - filtered.length };
}

/**
 * Run classification across all commits in batches.
 * Atomic: collects all results before returning. If any batch fails after retry,
 * it's recorded in batchErrors — no partial writes.
 */
export async function classifyCommits(
  commits: CommitEntry[],
  classifier: ClassifierInterface,
  repoName: string
): Promise<ClassifyResult> {
  const { filtered, skippedCount } = preFilterCommits(commits);
  const batches: CommitEntry[][] = [];

  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    batches.push(filtered.slice(i, i + BATCH_SIZE));
  }

  const allDecisions: ClassifiedDecision[] = [];
  const batchErrors: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let decisions: ClassifiedDecision[] | null = null;

    // Try once, retry once on failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        decisions = await classifier.classify(batch, repoName);
        break;
      } catch (err) {
        if (attempt === 1) {
          batchErrors.push(`Batch ${i + 1}/${batches.length}: ${(err as Error).message}`);
        }
      }
    }

    if (decisions) allDecisions.push(...decisions);
  }

  return { decisions: allDecisions, skippedCount, batchErrors };
}
