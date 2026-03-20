import * as fs from "node:fs";
import * as path from "node:path";

/** Patterns that indicate a secret value. Order: most specific first. */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/i },
  { name: "AWS Secret Key", pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*\S+/i },
  { name: "API Key assignment", pattern: /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9+/=_\-]{16,}['"]?/i },
  { name: "Bearer token", pattern: /bearer\s+[A-Za-z0-9+/=_\-]{20,}/i },
  { name: "Private key header", pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { name: "Password assignment", pattern: /password\s*[:=]\s*['"]?\S{8,}['"]?/i },
  { name: "Secret assignment", pattern: /secret\s*[:=]\s*['"]?\S{12,}['"]?/i },
  { name: "Token assignment", pattern: /token\s*[:=]\s*['"]?[A-Za-z0-9+/=_\-]{20,}['"]?/i },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{36}/i },
  { name: "Anthropic API key", pattern: /sk-ant-[A-Za-z0-9\-_]{40,}/i },
  { name: "OpenAI API key", pattern: /sk-[A-Za-z0-9]{48,}/i },
  { name: "Stripe key", pattern: /sk_(live|test)_[A-Za-z0-9]{24,}/i },
];

const ALLOWLIST_FILE = ".decidex-secrets.allow";

export interface SecretFinding {
  name: string;
  line: number;
  excerpt: string; // redacted preview
}

export interface ScanResult {
  clean: boolean;
  findings: SecretFinding[];
}

/** Load allowlist patterns from repo root (one regex per line). */
function loadAllowlist(repoRoot: string): RegExp[] {
  const fp = path.join(repoRoot, ALLOWLIST_FILE);
  if (!fs.existsSync(fp)) return [];
  return fs.readFileSync(fp, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => new RegExp(l, "i"));
}

/** Scan text for secrets. Returns findings array. */
export function scanText(text: string, repoRoot: string): ScanResult {
  const allowlist = loadAllowlist(repoRoot);
  const lines = text.split("\n");
  const findings: SecretFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check allowlist first
    if (allowlist.some((re) => re.test(line))) continue;

    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        const excerpt = line.replace(pattern, "[REDACTED]").trim().slice(0, 80);
        findings.push({ name, line: i + 1, excerpt });
        break; // one finding per line
      }
    }
  }

  return { clean: findings.length === 0, findings };
}

/** Install a pre-commit hook that scans .decisions/ for secrets. */
export function installPreCommitHook(repoRoot: string): void {
  const hooksDir = path.join(repoRoot, ".git", "hooks");
  const hookPath = path.join(hooksDir, "pre-commit");

  if (!fs.existsSync(hooksDir)) {
    throw new Error(`Not a git repo or .git/hooks missing: ${hooksDir}`);
  }

  const hookScript = `#!/bin/sh
# decidex secret scanner — added by 'decidex generate'
# To disable: remove this file or add patterns to .decidex-secrets.allow

STAGED=$(git diff --cached --name-only | grep "^\\.decisions/")
if [ -z "$STAGED" ]; then
  exit 0
fi

FOUND=0
for FILE in $STAGED; do
  if [ -f "$FILE" ]; then
    RESULT=$(npx decidex scan "$FILE" 2>/dev/null)
    if [ $? -ne 0 ]; then
      echo "[decidex] Secret detected in $FILE:"
      echo "$RESULT"
      FOUND=1
    fi
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo "[decidex] Commit blocked. Remove secrets or add patterns to .decidex-secrets.allow"
  exit 1
fi
exit 0
`;

  // Merge with existing hook if present
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf8");
    if (existing.includes("decidex secret scanner")) return; // already installed
    // Append to existing hook
    fs.appendFileSync(hookPath, "\n" + hookScript);
  } else {
    fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
  }
  fs.chmodSync(hookPath, 0o755);
}
