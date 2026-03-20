import { describe, it, expect, vi } from "vitest";
import {
  preFilterCommits,
  classifyCommits,
  estimateCost,
  type ClassifierInterface,
  type CommitEntry,
  type ClassifiedDecision,
} from "./git-classifier.js";

const REPO_NAME = "test-repo";

/** Mock classifier — returns deterministic decisions. */
function mockClassifier(decisions: ClassifiedDecision[]): ClassifierInterface {
  return {
    classify: vi.fn().mockResolvedValue(decisions),
  };
}

/** Mock failing classifier. */
function failingClassifier(errorMsg: string): ClassifierInterface {
  return {
    classify: vi.fn().mockRejectedValue(new Error(errorMsg)),
  };
}

describe("preFilterCommits", () => {
  it("filters commits shorter than 20 chars", () => {
    const commits: CommitEntry[] = [
      { hash: "a".repeat(40), subject: "fix", body: "" },           // 3 chars — skip
      { hash: "b".repeat(40), subject: "wip", body: "" },           // 3 chars — skip
      { hash: "c".repeat(40), subject: "use Zod for validation", body: "" }, // 22 — keep
    ];
    const { filtered, skippedCount } = preFilterCommits(commits);
    expect(filtered).toHaveLength(1);
    expect(skippedCount).toBe(2);
  });

  it("counts body length too", () => {
    const commits: CommitEntry[] = [
      { hash: "a".repeat(40), subject: "fix", body: "adds more validation here" }, // body 25 chars — keep
    ];
    const { filtered } = preFilterCommits(commits);
    expect(filtered).toHaveLength(1);
  });

  it("returns all commits if all are long enough", () => {
    const commits: CommitEntry[] = [
      { hash: "a".repeat(40), subject: "refactor: use Zod for all validation", body: "" },
      { hash: "b".repeat(40), subject: "chore: remove deprecated Yup dependency", body: "" },
    ];
    const { filtered, skippedCount } = preFilterCommits(commits);
    expect(filtered).toHaveLength(2);
    expect(skippedCount).toBe(0);
  });
});

describe("classifyCommits", () => {
  const commits: CommitEntry[] = [
    { hash: "a".repeat(40), subject: "refactor: migrate from Yup to Zod", body: "Zod has better TS support" },
    { hash: "b".repeat(40), subject: "chore: remove Passport.js auth", body: "Too complex, using JWT" },
  ];

  it("returns decisions from classifier", async () => {
    const decisions: ClassifiedDecision[] = [
      { area: "src/", text: "Use Zod not Yup", confidence: 4, rationale: "Better TS", tags: ["validation"] },
    ];
    const result = await classifyCommits(commits, mockClassifier(decisions), REPO_NAME);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].text).toBe("Use Zod not Yup");
    expect(result.batchErrors).toHaveLength(0);
  });

  it("records batch error when classifier fails both attempts", async () => {
    const result = await classifyCommits(commits, failingClassifier("API timeout"), REPO_NAME);
    expect(result.decisions).toHaveLength(0);
    expect(result.batchErrors).toHaveLength(1);
    expect(result.batchErrors[0]).toContain("API timeout");
  });

  it("retries once before giving up", async () => {
    const classifier = failingClassifier("network error");
    await classifyCommits(commits, classifier, REPO_NAME);
    expect(classifier.classify).toHaveBeenCalledTimes(2); // tried twice
  });

  it("skips short commits, reports skippedCount", async () => {
    const mixedCommits: CommitEntry[] = [
      ...commits,
      { hash: "c".repeat(40), subject: "fix", body: "" }, // too short
    ];
    const result = await classifyCommits(mixedCommits, mockClassifier([]), REPO_NAME);
    expect(result.skippedCount).toBe(1);
  });

  it("collects decisions across multiple batches", async () => {
    // Create 2 batches worth of commits (501 total)
    const manyCommits: CommitEntry[] = Array.from({ length: 501 }, (_, i) => ({
      hash: i.toString().padStart(40, "0"),
      subject: `refactor: change number ${i} with some meaningful description`,
      body: "",
    }));

    const decisions: ClassifiedDecision[] = [
      { area: "src/", text: "Use pattern X", confidence: 3, rationale: "efficiency", tags: [] },
    ];
    const classifier = mockClassifier(decisions);
    const result = await classifyCommits(manyCommits, classifier, REPO_NAME);

    // Called twice (once per batch)
    expect(classifier.classify).toHaveBeenCalledTimes(2);
    // Both batches returned 1 decision each = 2 total
    expect(result.decisions).toHaveLength(2);
  });
});

describe("estimateCost", () => {
  it("returns a cost string for 0 commits", () => {
    const { usd } = estimateCost(0);
    expect(usd).toBe("<$0.01");
  });

  it("returns a cost string for 1000 commits", () => {
    const { usd } = estimateCost(1000);
    expect(usd).toMatch(/~\$\d+\.\d{2}|<\$0\.01/);
  });

  it("returns token count greater than commit count", () => {
    const { tokens } = estimateCost(10);
    expect(tokens).toBeGreaterThan(10);
  });
});
