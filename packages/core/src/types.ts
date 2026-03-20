/** Schema version — bump when file format changes (requires migration tool). */
export const DECISION_SCHEMA_VERSION = 1;

/** A single captured engineering decision. */
export interface Decision {
  id: string;
  version: number;
  author: string;
  timestamp: string; // ISO 8601
  area: string;      // relative path within repo, e.g. "src/auth/"
  confidence: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  text: string;      // the decision body
  rationale?: string;
  source: "generate" | "capture"; // how it was created
}

/** Result from classifying a batch of commits. */
export interface ClassifyResult {
  decisions: ClassifiedDecision[];
  skippedCount: number;
  batchErrors: string[];
}

/** A decision extracted by the LLM classifier. */
export interface ClassifiedDecision {
  area: string;
  text: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  rationale: string;
  tags: string[];
}

/** Options for the generate command. */
export interface GenerateOptions {
  since?: string;       // e.g. "90d", "2024-01-01"
  yes?: boolean;        // skip cost prompt
  local?: boolean;      // use Ollama instead of Claude API
  ollamaModel?: string; // override Ollama model
  dryRun?: boolean;     // count commits, show estimate, exit
}

/** Stats about the local decision store. */
export interface StoreStats {
  total: number;
  byArea: Record<string, number>;
  recentDecisions: Decision[];
  oldestTimestamp?: string;
  newestTimestamp?: string;
}
