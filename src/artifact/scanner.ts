import { join, relative } from "path";
import type { FileSystem } from "#/core";
import {
  ArtifactManifestSchema,
  type ArtifactManifest,
  type ArtifactFrontmatter,
  type Components,
  type ComponentSummary,
} from "#/schemas";
import { type Category, CATEGORIES, getCategoriesForFormat, createCategoryRecord, isValidCategory } from "#/categories";
import { safeParseYaml } from "#/friendly-errors";
import { parseFrontmatter } from "./frontmatter";
import type {
  InvalidFileReason,
  InvalidFile,
  ParsedComponent,
  ScannedFile,
  ArtifactInfo,
} from "./scanner.types";

const MD_CATEGORIES = getCategoriesForFormat("md");
const JSON_CATEGORIES = getCategoriesForFormat("json");

function readArtifactManifest(fs: FileSystem, artifactDir: string): ArtifactManifest | null {
  const manifestPath = join(artifactDir, "grekt.yaml");
  if (!fs.exists(manifestPath)) return null;

  const content = fs.readFile(manifestPath);
  const result = safeParseYaml(content, ArtifactManifestSchema, manifestPath);
  return result.success ? result.data : null;
}

interface FoundFiles {
  mdFiles: string[];
  jsonFiles: string[];
}

function findFiles(fs: FileSystem, dir: string): FoundFiles {
  const result: FoundFiles = { mdFiles: [], jsonFiles: [] };

  const entries = fs.readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = fs.stat(fullPath);

    if (stat.isDirectory) {
      const nested = findFiles(fs, fullPath);
      result.mdFiles.push(...nested.mdFiles);
      result.jsonFiles.push(...nested.jsonFiles);
    } else if (entry.endsWith(".md")) {
      result.mdFiles.push(fullPath);
    } else if (entry.endsWith(".json") && entry !== "package.json") {
      result.jsonFiles.push(fullPath);
    }
  }

  return result;
}

type JsonParseResult =
  | { success: true; parsed: ParsedComponent }
  | { success: false; reason: InvalidFileReason; missingFields?: string[]; details?: string };

function getReasonFromMissingFields(missingFields: string[]): InvalidFileReason {
  if (missingFields.includes("grk-type")) return "missing-type";
  if (missingFields.includes("grk-name")) return "missing-name";
  return "missing-description";
}

function parseJsonComponent(content: string): JsonParseResult {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content);
  } catch {
    return { success: false, reason: "invalid-json" };
  }

  // Fallback: use unprefixed fields (name, description, type) when grk-* are missing.
  // Matches the same behavior as frontmatter.ts for markdown files.
  if (!data["grk-type"] && data["type"]) data["grk-type"] = data["type"];
  if (!data["grk-name"] && data["name"]) data["grk-name"] = data["name"];
  if (!data["grk-description"] && data["description"]) data["grk-description"] = data["description"];

  const missingFields: string[] = [];
  if (!data["grk-type"]) missingFields.push("grk-type");
  if (!data["grk-name"]) missingFields.push("grk-name");
  if (!data["grk-description"]) missingFields.push("grk-description");

  if (missingFields.length > 0) {
    const reason = getReasonFromMissingFields(missingFields);
    return { success: false, reason, missingFields };
  }

  const rawType = data["grk-type"];
  if (typeof rawType !== "string" || !isValidCategory(rawType)) {
    const details = `grk-type: got '${rawType}', expected one of: ${CATEGORIES.join(", ")}`;
    return { success: false, reason: "missing-type", details };
  }
  if (!JSON_CATEGORIES.includes(rawType)) {
    const details = `grk-type '${rawType}' is not valid for JSON files, expected: ${JSON_CATEGORIES.join(", ")}`;
    return { success: false, reason: "invalid-type-for-format", details };
  }

  const frontmatter: ArtifactFrontmatter = {
    "grk-type": rawType,
    "grk-name": data["grk-name"] as string,
    "grk-description": data["grk-description"] as string,
  };

  // Strip grk-* metadata and their unprefixed equivalents from content
  const {
    "grk-type": _type, "grk-name": _name, "grk-description": _desc,
    type: _uType, name: _uName, description: _uDesc,
    ...rest
  } = data;

  return { success: true, parsed: { frontmatter, content: rest } };
}

export function scanArtifact(fs: FileSystem, artifactDir: string): ArtifactInfo | null {
  const manifest = readArtifactManifest(fs, artifactDir);
  if (!manifest) return null;

  // Initialize info with empty arrays for all categories
  const info: ArtifactInfo = {
    manifest,
    invalidFiles: [],
    ...createCategoryRecord<ScannedFile[]>(() => []),
  };

  const files = findFiles(fs, artifactDir);

  for (const filePath of files.mdFiles) {
    const content = fs.readFile(filePath);
    const result = parseFrontmatter(content);
    const relativePath = relative(artifactDir, filePath);

    if (!result.success) {
      info.invalidFiles.push({
        path: relativePath,
        reason: result.reason,
        missingFields: result.missingFields,
        details: result.details,
      });
      continue;
    }

    const { parsed } = result;
    const category = parsed.frontmatter["grk-type"];

    if (MD_CATEGORIES.includes(category)) {
      info[category].push({ path: relativePath, parsed });
    }
  }

  for (const filePath of files.jsonFiles) {
    const content = fs.readFile(filePath);
    const result = parseJsonComponent(content);
    const relativePath = relative(artifactDir, filePath);

    if (!result.success) {
      info.invalidFiles.push({
        path: relativePath,
        reason: result.reason,
        missingFields: result.missingFields,
        details: result.details,
      });
      continue;
    }

    const { parsed } = result;
    const category = parsed.frontmatter["grk-type"];

    if (JSON_CATEGORIES.includes(category)) {
      info[category].push({ path: relativePath, parsed });
    }
  }

  return info;
}

/**
 * Generate components summary from scanned artifact info.
 * This is used during publish/pack to auto-generate the components section.
 */
export function generateComponents(info: ArtifactInfo): Components {
  const components: Record<Category, ComponentSummary[]> = {} as Record<Category, ComponentSummary[]>;

  for (const category of CATEGORIES) {
    const files = info[category];
    if (files.length > 0) {
      components[category] = files.map((file) => ({
        name: file.parsed.frontmatter["grk-name"],
        file: file.path,
        description: file.parsed.frontmatter["grk-description"],
      }));
    }
  }

  // Return undefined if no components (cleaner yaml output)
  if (Object.keys(components).length === 0) {
    return undefined;
  }

  return components;
}

export type {
  InvalidFileReason,
  InvalidFile,
  ParsedComponent,
  ParsedArtifact,
  ScannedFile,
  ArtifactInfo,
} from "./scanner.types";
