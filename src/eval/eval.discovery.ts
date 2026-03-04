import type { FileSystem } from "#/core";
import { parseFrontmatter } from "#/artifact/frontmatter";
import { safeParseYaml } from "#/friendly-errors";
import { EvalFileConfigSchema } from "./eval.schemas";
import { EVALUABLE_CATEGORIES } from "./eval.types";
import type {
  DiscoveredEval,
  EvalDiscoveryResult,
  EvalDiscoveryWarning,
  EvalFilter,
} from "./eval.types";

const EVAL_EXTENSION = ".eval.yaml";

/**
 * Recursively collect all file paths under a directory.
 */
function collectFiles(fs: FileSystem, dir: string, basePath = ""): string[] {
  const paths: string[] = [];

  let entries: string[];
  try {
    entries = fs.readdir(dir);
  } catch {
    return paths;
  }

  for (const entry of entries) {
    const fullPath = `${dir}/${entry}`;
    const relativePath = basePath ? `${basePath}/${entry}` : entry;

    try {
      const stat = fs.stat(fullPath);
      if (stat.isDirectory) {
        paths.push(...collectFiles(fs, fullPath, relativePath));
      } else {
        paths.push(relativePath);
      }
    } catch {
      // Skip unreadable entries
    }
  }

  return paths;
}

export interface DiscoverEvalsOptions {
  artifactDir: string;
  artifactId: string;
  filter?: EvalFilter;
}

/**
 * Discover eval files in an artifact directory.
 *
 * Walks the artifact dir, finds *.eval.yaml files, matches each to its sibling .md file,
 * validates the element is evaluable (agents/skills/commands), parses both files,
 * and returns discovered evals with warnings for any issues.
 */
export function discoverEvals(
  fs: FileSystem,
  options: DiscoverEvalsOptions,
): EvalDiscoveryResult {
  const { artifactDir, artifactId, filter } = options;
  const evals: DiscoveredEval[] = [];
  const warnings: EvalDiscoveryWarning[] = [];

  const allFiles = collectFiles(fs, artifactDir);
  const evalFiles = allFiles.filter((f) => f.endsWith(EVAL_EXTENSION));

  for (const evalRelativePath of evalFiles) {
    const evalFullPath = `${artifactDir}/${evalRelativePath}`;

    // Derive sibling .md path: tone-checker.eval.yaml -> tone-checker.md
    const baseName = evalRelativePath.slice(0, -EVAL_EXTENSION.length);
    const mdRelativePath = `${baseName}.md`;
    const mdFullPath = `${artifactDir}/${mdRelativePath}`;

    // Check sibling .md exists
    if (!fs.exists(mdFullPath)) {
      warnings.push({
        evalFilePath: evalRelativePath,
        message: `Skipped ${evalRelativePath}: no matching .md file found (expected ${mdRelativePath})`,
      });
      continue;
    }

    // Parse the .md file frontmatter
    let mdContent: string;
    try {
      mdContent = fs.readFile(mdFullPath);
    } catch {
      warnings.push({
        evalFilePath: evalRelativePath,
        message: `Skipped ${evalRelativePath}: could not read ${mdRelativePath}`,
      });
      continue;
    }

    const frontmatterResult = parseFrontmatter(mdContent);
    if (!frontmatterResult.success) {
      warnings.push({
        evalFilePath: evalRelativePath,
        message: `Skipped ${evalRelativePath}: ${mdRelativePath} has invalid or missing frontmatter`,
      });
      continue;
    }

    const { frontmatter, content: systemPrompt } = frontmatterResult.parsed;
    const elementType = frontmatter["grk-type"];
    const elementName = frontmatter["grk-name"];

    // Check element is evaluable (agents, skills, commands only)
    if (!EVALUABLE_CATEGORIES.includes(elementType)) {
      warnings.push({
        evalFilePath: evalRelativePath,
        message: `Skipped ${evalRelativePath}: ${elementType} is not evaluable (only agents, skills, commands)`,
      });
      continue;
    }

    // Parse the .eval.yaml file
    let evalYamlContent: string;
    try {
      evalYamlContent = fs.readFile(evalFullPath);
    } catch {
      warnings.push({
        evalFilePath: evalRelativePath,
        message: `Skipped ${evalRelativePath}: file could not be read`,
      });
      continue;
    }

    const parseResult = safeParseYaml(evalYamlContent, EvalFileConfigSchema, evalRelativePath);
    if (!parseResult.success) {
      const details = parseResult.error.details?.join(", ") ?? "";
      warnings.push({
        evalFilePath: evalRelativePath,
        message: `Skipped ${evalRelativePath}: ${parseResult.error.message}${details ? ` (${details})` : ""}`,
      });
      continue;
    }

    const evalConfig = parseResult.data;

    // Apply filters
    if (filter?.elementName && elementName !== filter.elementName) continue;
    if (filter?.elementType && elementType !== filter.elementType) continue;

    evals.push({
      artifactId,
      elementName,
      elementType,
      elementPath: mdRelativePath,
      systemPrompt: systemPrompt.trim(),
      evalConfig,
      evalFilePath: evalRelativePath,
    });
  }

  return { evals, warnings };
}
