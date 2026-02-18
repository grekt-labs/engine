import { join, relative } from "path";
import { scanSkill } from "agentverus-scanner";
import type { FileSystem } from "#/core";
import type { SecurityReport, SecurityFinding, TrustBadge } from "./security.types";

// File extensions considered scannable content (same as registry)
const SCANNABLE_EXTENSIONS = new Set([
  ".md",
  ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".mts", ".cts", ".tsx",
  ".py", ".rb", ".go", ".rs", ".lua",
  ".sh", ".bash", ".zsh", ".fish",
  ".ps1", ".bat", ".cmd",
]);

// Max content size to scan (2 MB, same as registry)
const MAX_SCAN_CONTENT_BYTES = 2 * 1024 * 1024;

function isScannable(filename: string): boolean {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1) return false;
  return SCANNABLE_EXTENSIONS.has(filename.slice(lastDotIndex).toLowerCase());
}

/**
 * Recursively collect all scannable files from a directory.
 */
function collectFiles(fs: FileSystem, dir: string): string[] {
  const result: string[] = [];
  const entries = fs.readdir(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = fs.stat(fullPath);

    if (stat.isDirectory) {
      result.push(...collectFiles(fs, fullPath));
    } else if (isScannable(entry)) {
      result.push(fullPath);
    }
  }

  return result;
}

/**
 * Concatenate file contents up to the size cap.
 * Each file is separated by double newlines for scanner readability.
 */
function concatenateFileContents(fs: FileSystem, filePaths: string[]): string {
  const parts: string[] = [];
  let totalBytes = 0;

  for (const filePath of filePaths) {
    const content = fs.readFile(filePath);
    const contentBytes = Buffer.byteLength(content, "utf-8");

    if (totalBytes + contentBytes > MAX_SCAN_CONTENT_BYTES) break;

    parts.push(content);
    totalBytes += contentBytes;
  }

  return parts.join("\n\n");
}

/**
 * Scan an artifact directory for security issues using AgentVerus.
 *
 * Reads all scannable files (.md, code files), concatenates their content,
 * and runs the AgentVerus scanner to produce a structured security report.
 */
export async function scanArtifactSecurity(
  fs: FileSystem,
  artifactDir: string,
): Promise<SecurityReport> {
  const filePaths = collectFiles(fs, artifactDir);
  const content = concatenateFileContents(fs, filePaths);

  if (!content.trim()) {
    return {
      score: 100,
      badge: "certified",
      findings: [],
      categoryScores: {},
      scannedAt: new Date().toISOString(),
      filesScanned: filePaths.length,
    };
  }

  const report = await scanSkill(content);

  const categoryScores: Record<string, number> = {};
  for (const [category, categoryScore] of Object.entries(report.categories)) {
    categoryScores[category] = categoryScore.score;
  }

  const findings: SecurityFinding[] = report.findings.map((finding) => ({
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    evidence: finding.evidence,
    deduction: finding.deduction,
    recommendation: finding.recommendation,
  }));

  const normalizedBadge = report.badge.toLowerCase() as TrustBadge;

  return {
    score: Math.round(report.overall * 100) / 100,
    badge: normalizedBadge,
    findings,
    categoryScores,
    scannedAt: new Date().toISOString(),
    filesScanned: filePaths.length,
  };
}
