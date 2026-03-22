import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
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
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    try {
      return parseClassifierResponse(text);
    } catch (err) {
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const outDir = path.join(process.cwd(), ".decidex");
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "last_claude_response.txt"), String(text).slice(0, 10000), "utf8");
      } catch {}
      throw err;
    }
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
    try {
      return parseClassifierResponse(data.response);
    } catch (err) {
      try {
        // Attempt to write the full JSON body and raw text to a local file for debugging
        const fs = await import("node:fs");
        const path = await import("node:path");
        const outDir = path.join(process.cwd(), ".decidex");
        try {
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(path.join(outDir, "last_ollama_response.json"), JSON.stringify(data, null, 2), "utf8");
          fs.writeFileSync(path.join(outDir, "last_ollama_response.txt"), String(data.response).slice(0, 10000), "utf8");
        } catch {}
      } catch {}
      throw err;
    }
  }
}

/**
 * Parse and validate the classifier JSON response with tolerant extraction and
 * coercion. Attempts multiple extraction strategies (raw JSON, fenced code
 * blocks, first {...} or [...] span) and coerces common shape issues before
 * running Zod validation so the classifier is more robust to model output
 * variations.
 */
function parseClassifierResponse(text: string): ClassifiedDecision[] {
  if (!text || !text.trim()) throw new Error("Empty classifier response");

  let parsed: any | null = null;

  // 1) Try direct JSON parse
  try {
    parsed = JSON.parse(text);
  } catch {
    // ignore and try other strategies
  }

  // 2) Try code fence extraction: ```json ... ``` or ``` ... ```
  if (parsed === null) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && fence[1]) {
      try {
        parsed = JSON.parse(fence[1]);
      } catch {
        // continue to other strategies
      }
    }
  }

  // 3) Try to extract the first {...} or [...] block (greedy to last matching brace)
  if (parsed === null) {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.slice(firstBrace, lastBrace + 1);
      try {
        parsed = JSON.parse(candidate);
      } catch {
        // fallthrough
      }
    }

    if (parsed === null && firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const candidate = text.slice(firstBracket, lastBracket + 1);
      try {
        parsed = JSON.parse(candidate);
      } catch {
        // still nothing
      }
    }
  }

  if (parsed === null) {
    // last resort: try to find any {...} span using a simple regex
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // write raw response for inspection
      try {
        const outDir = path.join(process.cwd(), ".decidex");
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "last_classifier_response.txt"), String(text).slice(0, 10000), "utf8");
      } catch {}
      throw new Error(`No JSON found in classifier response: ${text.slice(0, 240)}`);
    }
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      try {
        const outDir = path.join(process.cwd(), ".decidex");
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "last_classifier_response.txt"), String(text).slice(0, 10000), "utf8");
      } catch {}
      throw new Error(`Failed to parse JSON from classifier response: ${(err as Error).message}`);
    }
  }

  // Normalize common shapes: classifier might return an array directly
  if (Array.isArray(parsed)) {
    parsed = { decisions: parsed };
  }

  // Coerce fields where possible (strings for numbers, ensure tags array, etc.)
  if (parsed && parsed.decisions && Array.isArray(parsed.decisions)) {
    parsed.decisions = parsed.decisions.map((d: any): ClassifiedDecision => ({
      area: typeof d.area === "string" ? d.area : "",
      text: typeof d.text === "string" ? d.text : String(d.text ?? ""),
      confidence: (typeof d.confidence === "number" ? d.confidence : parseInt(String(d.confidence ?? "3"), 10)) as ClassifiedDecision["confidence"],
      rationale: typeof d.rationale === "string" ? d.rationale : String(d.rationale ?? ""),
      tags: Array.isArray(d.tags) ? d.tags.map((t: any) => String(t)) : [],
    }));
  }

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
  async function classifyBatch(batch: CommitEntry[], idxLabel: string): Promise<void> {
    // Try twice; on persistent failure, split the batch and retry sub-batches.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const decisions = await classifier.classify(batch, repoName);
        allDecisions.push(...decisions);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt === 0) continue; // retry once
        // after retry, fall through to splitting
      }
    }

    // If batch is single commit and still fails, record error
    if (batch.length <= 1) {
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      batchErrors.push(`${idxLabel}: ${msg}`);
      return;
    }

    // Split batch in half and try each half (binary split to reduce prompt size)
    const mid = Math.floor(batch.length / 2);
    const left = batch.slice(0, mid);
    const right = batch.slice(mid);
    await classifyBatch(left, `${idxLabel}.L`);
    await classifyBatch(right, `${idxLabel}.R`);
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await classifyBatch(batch, `Batch ${i + 1}/${batches.length}`);
  }

  return { decisions: allDecisions, skippedCount, batchErrors };
}
