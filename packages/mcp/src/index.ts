#!/usr/bin/env node
/**
 * decidex MCP server — exposes engineering decisions to Claude Code.
 *
 * Usage (add to ~/.claude/claude_desktop_config.json or CLAUDE.md):
 *   {
 *     "mcpServers": {
 *       "decidex": {
 *         "command": "decidex-mcp",
 *         "args": ["--repo", "/path/to/your/project"]
 *       }
 *     }
 *   }
 *
 * Tools exposed:
 *   get_decisions(area, limit?) → decisions relevant to a file/directory
 *   get_stats()                  → store stats (total, by area)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDecisions, getStoreStats } from "@decidex/core";
import * as path from "node:path";
import * as fs from "node:fs";

// Parse --repo flag from argv
const repoArgIdx = process.argv.indexOf("--repo");
const repoRoot = repoArgIdx !== -1 && process.argv[repoArgIdx + 1]
  ? path.resolve(process.argv[repoArgIdx + 1])
  : process.cwd();

if (!fs.existsSync(repoRoot)) {
  process.stderr.write(`[decidex-mcp] repo not found: ${repoRoot}\n`);
  process.exit(1);
}

const server = new McpServer({
  name: "decidex",
  version: "0.1.0",
});

server.tool(
  "get_decisions",
  "Retrieve engineering decisions relevant to a file or directory path. " +
    "Call this when starting work on a file to surface decisions that apply to that area. " +
    "Returns decisions sorted by recency, most recent first.",
  {
    area: z
      .string()
      .describe(
        "Relative path of the file or directory you are working on (e.g. 'src/auth/' or 'src/api/users.ts'). " +
          "Use '' for repo-wide decisions."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Maximum number of decisions to return (default 10, max 50)."),
  },
  async ({ area, limit }) => {
    const decisions = getDecisions(repoRoot, area, limit);

    if (decisions.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No decisions found for area: ${area || "(repo-wide)"}. Run \`decidex generate\` to extract decisions from git history.`,
          },
        ],
      };
    }

    const formatted = decisions
      .map((d) => {
        const header = `[${d.area || "repo-wide"}] ${d.text}`;
        const meta = `  confidence: ${d.confidence}/5 | tags: ${d.tags.join(", ")} | ${d.timestamp.slice(0, 10)}`;
        const rationale = d.rationale ? `  rationale: ${d.rationale}` : "";
        return [header, meta, rationale].filter(Boolean).join("\n");
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Engineering decisions for ${area || "(repo-wide)"} (${decisions.length} found):\n\n${formatted}`,
        },
      ],
    };
  }
);

server.tool(
  "get_stats",
  "Get a summary of all captured engineering decisions — total count and breakdown by area. " +
    "Useful for understanding how many decisions exist and which parts of the codebase have the most context.",
  {},
  async () => {
    const stats = getStoreStats(repoRoot);

    if (stats.total === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No decisions captured yet. Run `decidex generate` to extract decisions from git history.",
          },
        ],
      };
    }

    const byArea = Object.entries(stats.byArea)
      .sort((a, b) => b[1] - a[1])
      .map(([area, count]) => `  ${(area || "(repo-wide)").padEnd(40)} ${count}`)
      .join("\n");

    const dateRange =
      stats.oldestTimestamp && stats.newestTimestamp
        ? `${stats.newestTimestamp.slice(0, 10)} ← newest\n  ${stats.oldestTimestamp.slice(0, 10)} ← oldest`
        : "";

    return {
      content: [
        {
          type: "text",
          text: [
            `Total decisions: ${stats.total}`,
            dateRange,
            "",
            "By area:",
            byArea,
          ]
            .filter((l) => l !== undefined)
            .join("\n"),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport).catch((err: Error) => {
  process.stderr.write(`[decidex-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
