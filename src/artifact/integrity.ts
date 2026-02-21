import { createHash } from "crypto";
import { join, relative } from "path";
import type { FileSystem } from "#/core";

export function hashContent(content: string): string {
  const hash = createHash("sha256").update(content).digest("hex");
  return `sha256:${hash.slice(0, 32)}`;
}

/**
 * Hash a single file by reading its content
 */
export function hashFile(fs: FileSystem, filePath: string): string {
  const content = fs.readFile(filePath);
  return hashContent(content);
}

/**
 * Hash all files in a directory recursively
 * Returns a map of relative paths to their hashes
 */
export function hashDirectory(fs: FileSystem, dir: string): Record<string, string> {
  const hashes: Record<string, string> = {};

  function walkDir(currentDir: string): void {
    const entries = fs.readdir(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = fs.stat(fullPath);

      if (stat.isDirectory) {
        walkDir(fullPath);
      } else if (stat.isFile) {
        const relativePath = relative(dir, fullPath);
        const content = fs.readFile(fullPath);
        hashes[relativePath] = hashContent(content);
      }
    }
  }

  walkDir(dir);
  return hashes;
}

/**
 * Calculate integrity hash for entire artifact (hash of sorted file hashes)
 */
export function calculateIntegrity(fileHashes: Record<string, string>): string {
  const sortedKeys = Object.keys(fileHashes).sort();
  const combined = sortedKeys.map((k) => `${k}:${fileHashes[k]}`).join("\n");
  const hash = createHash("sha256").update(combined).digest("hex");
  return `sha256:${hash.slice(0, 32)}`;
}

export interface IntegrityResult {
  valid: boolean;
  missingFiles: string[];
  modifiedFiles: { path: string; expected: string; actual: string }[];
  extraFiles: string[];
}

/**
 * Compare expected file hashes against actual file hashes.
 * Pure comparison — no I/O, works with any source of hashes.
 */
export function compareHashes(
  expectedFiles: Record<string, string>,
  actualFiles: Record<string, string>,
): IntegrityResult {
  const result: IntegrityResult = {
    valid: true,
    missingFiles: [],
    modifiedFiles: [],
    extraFiles: [],
  };

  const actualEntries = new Map(Object.entries(actualFiles));

  for (const [path, expectedHash] of Object.entries(expectedFiles)) {
    const actualHash = actualEntries.get(path);

    if (actualHash === undefined) {
      result.missingFiles.push(path);
      result.valid = false;
      continue;
    }

    if (actualHash !== expectedHash) {
      result.modifiedFiles.push({ path, expected: expectedHash, actual: actualHash });
      result.valid = false;
    }
  }

  for (const path of actualEntries.keys()) {
    if (!(path in expectedFiles)) {
      result.extraFiles.push(path);
    }
  }

  return result;
}

/**
 * Verify integrity of an artifact against lockfile hashes
 */
export function verifyIntegrity(
  fs: FileSystem,
  artifactDir: string,
  expectedFiles: Record<string, string>
): IntegrityResult {
  const actualHashes = hashDirectory(fs, artifactDir);
  return compareHashes(expectedFiles, actualHashes);
}

/**
 * Get total size of all files in a directory (in bytes)
 */
export function getDirectorySize(fs: FileSystem, dir: string): number {
  let totalSize = 0;

  function walkDir(currentDir: string): void {
    const entries = fs.readdir(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = fs.stat(fullPath);

      if (stat.isDirectory) {
        walkDir(fullPath);
      } else if (stat.isFile) {
        totalSize += stat.size;
      }
    }
  }

  walkDir(dir);
  return totalSize;
}
