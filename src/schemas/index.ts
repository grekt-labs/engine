import { z } from "zod";
import { isValidSemver } from "#/version";
import { CATEGORIES, CATEGORY_CONFIG, type Category } from "#/categories";

// Helper to create category-keyed schemas dynamically
function createCategoryRecord<T extends z.ZodTypeAny>(schema: T) {
  return z.object(
    Object.fromEntries(CATEGORIES.map((cat) => [cat, schema])) as Record<Category, T>
  );
}

// Sync targets (validated at runtime against registered plugins)
export type SyncTarget = string;

// Semver validation schema
export const SemverSchema = z.string().refine(isValidSemver, {
  message: "Invalid semver version. Must be valid semver (e.g., 1.0.0, 2.1.0-beta.1)",
});

// Keywords schemas
export const KeywordSchema = z.string().trim().min(1);
export const KeywordsSchema = z.array(KeywordSchema);
export const KeywordsPublishSchema = KeywordsSchema.min(3).max(5);

// Component summary for auto-generated components section
// This is generated during publish/pack, not written by authors
export const ComponentSummarySchema = z.object({
  name: z.string(),
  file: z.string(),
  description: z.string(),
});
export type ComponentSummary = z.infer<typeof ComponentSummarySchema>;

// Components section: category -> array of component summaries
// Using partial record since not all categories may have components
export const ComponentsSchema = z.record(
  z.enum(CATEGORIES),
  z.array(ComponentSummarySchema)
).optional();
export type Components = z.infer<typeof ComponentsSchema>;

// Artifact manifest (grekt.yaml inside each published artifact)
// name can be scoped (@scope/name) or unscoped (name)
// Scoped names are required for publishing to registries
export const ArtifactManifestSchema = z.object({
  name: z.string(),
  author: z.string().optional(), // Optional, only for credits/metadata
  version: SemverSchema,
  description: z.string(),
  keywords: KeywordsSchema.optional(),
  private: z.boolean().optional(),
  license: z.string().optional(),
  repository: z.string().url().optional(),
  components: ComponentsSchema, // Auto-generated during publish/pack
});
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;

// Artifact component frontmatter (YAML at top of .md files)
// Uses grk- prefix to avoid collisions with other tools' frontmatter
export const ArtifactFrontmatterSchema = z.object({
  "grk-type": z.enum(CATEGORIES),
  "grk-name": z.string(),
  "grk-description": z.string(),
  "grk-agents": z.string().optional(), // for skills/commands that belong to an agent
});
export type ArtifactFrontmatter = z.infer<typeof ArtifactFrontmatterSchema>;

// Paths configuration for custom targets (directory per component type)
export const ComponentPathsSchema = createCategoryRecord(z.string().optional());
export type ComponentPaths = z.infer<typeof ComponentPathsSchema>;

// Custom target configuration (for "Other" option in init/sync)
export const CustomTargetSchema = z.object({
  name: z.string(),
  contextEntryPoint: z.string(),
  paths: ComponentPathsSchema.optional(),
});
export type CustomTarget = z.infer<typeof CustomTargetSchema>;

// Sync mode: lazy (default) = only in index, core = copied to target, core-sym = symlinked to target
export const ArtifactModeSchema = z.enum(["core", "core-sym", "lazy"]);
export type ArtifactMode = z.infer<typeof ArtifactModeSchema>;

// Artifact entry in grekt.yaml - either version string (all) or object (selected components)
// Category selection fields are arrays of paths
const artifactEntryCategoryFields = Object.fromEntries(
  CATEGORIES.map((cat) => [cat, z.array(z.string()).optional()])
) as Record<Category, z.ZodOptional<z.ZodArray<z.ZodString>>>;

export const ArtifactEntrySchema = z.union([
  SemverSchema, // "1.0.0" = all components, LAZY mode
  z.object({
    version: SemverSchema,
    mode: ArtifactModeSchema.default("lazy"), // LAZY by default, CORE opt-in
    trusted: z.boolean().optional(),
    ...artifactEntryCategoryFields,
  }),
]);
export type ArtifactEntry = z.infer<typeof ArtifactEntrySchema>;

// Project config (grekt.yaml) - unified schema for both projects and artifacts
// Projects use: targets, artifacts, customTargets
// Artifacts use: name (@scope/name for publishing), version, description, keywords
// author is optional (only for credits/metadata)
export const ProjectConfigSchema = z.object({
  // Manifest fields (for publishing artifacts)
  name: z.string().optional(),
  author: z.string().optional(),
  version: SemverSchema.optional(),
  description: z.string().optional(),
  keywords: KeywordsSchema.optional(),
  license: z.string().optional(),
  repository: z.string().url().optional(),

  // Config fields (for consuming artifacts)
  targets: z.array(z.string()).default([]),
  registry: z.string().optional(),
  remoteSearch: z.boolean().default(true), // Allow skill router to search the public registry when no local match is found
  artifacts: z.record(z.string(), ArtifactEntrySchema).default({}),
  customTargets: z.record(z.string(), CustomTargetSchema).default({}),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// Validation helper: check if config has required manifest fields for publishing
// Note: author is optional (only for credits), scope comes from name
export function hasManifestFields(config: ProjectConfig): config is ProjectConfig & {
  name: string;
  version: string;
  description: string;
  keywords: string[];
} {
  return !!(
    config.name &&
    config.version &&
    config.description &&
    config.keywords &&
    config.keywords.length > 0
  );
}

// S3 credentials for publishing to S3-compatible storage
export const S3CredentialsSchema = z.object({
  type: z.literal("s3"),
  endpoint: z.string().url(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  bucket: z.string(),
  publicUrl: z.string().url().optional(),
});
export type S3Credentials = z.infer<typeof S3CredentialsSchema>;

// Simple token credentials for git sources (GitHub, GitLab)
export const TokenCredentialsSchema = z.object({
  token: z.string(),
});
export type TokenCredentials = z.infer<typeof TokenCredentialsSchema>;

// API registry credentials (url + token)
export const ApiCredentialsSchema = z.object({
  url: z.string(),
  token: z.string(),
});
export type ApiCredentials = z.infer<typeof ApiCredentialsSchema>;

// Registry credentials - can be S3, token-based, or API-based
export const RegistryCredentialsSchema = z.union([
  S3CredentialsSchema,
  TokenCredentialsSchema,
  ApiCredentialsSchema,
]);
export type RegistryCredentials = z.infer<typeof RegistryCredentialsSchema>;

export const CredentialsSchema = z.record(
  z.string(), // registry name (e.g., "default", "github", "gitlab.com")
  RegistryCredentialsSchema
);
export type Credentials = z.infer<typeof CredentialsSchema>;

// Lockfile entry (grekt.lock) - pinned versions, integrity hashes, and resolved URLs for reproducible installs
export const LockfileEntrySchema = z.object({
  version: SemverSchema,
  integrity: z.string(), // SHA256 hash of entire artifact
  source: z.string().optional(),
  resolved: z.string().optional(), // Full URL, IMMUTABLE after write
  mode: ArtifactModeSchema.default("lazy"), // core = copied to target, lazy = only in index
  files: z.record(z.string(), z.string()).default({}), // per-file hashes: { "agent.md": "sha256:abc..." }
});

export const LockfileSchema = z.object({
  version: z.literal(1),
  artifacts: z.record(z.string(), LockfileEntrySchema).default({}),
});
export type Lockfile = z.infer<typeof LockfileSchema>;
export type LockfileEntry = z.infer<typeof LockfileEntrySchema>;

// Registry artifact metadata (stored in S3 as metadata.json per artifact)
export const ArtifactMetadataSchema = z.object({
  name: z.string(), // Full artifact ID: @author/name
  latest: z.string(), // Latest version (highest semver)
  versions: z.array(z.string()).optional(), // All available versions
  deprecated: z.record(z.string(), z.string()).default({}), // version -> deprecation message
  createdAt: z.string(), // ISO timestamp
  updatedAt: z.string(), // ISO timestamp
});
export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

// Registry entry for local config (.grekt/config.yaml)
export const RegistryEntrySchema = z.object({
  type: z.enum(["gitlab", "github", "default"]),
  project: z.string().optional(), // Required for gitlab/github, validated at runtime
  host: z.string().optional(), // Optional, has defaults (gitlab.com, github.com)
  token: z.string().optional(), // Can also be set via env vars
  prefix: z.string().optional(), // Package name prefix (e.g., "frontend" → "frontend-artifact-name")
});
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

// Session stored in local config (generated by grekt login)
export const StoredSessionSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number().optional(),
});
export type StoredSession = z.infer<typeof StoredSessionSchema>;

// Tokens for git sources (github, gitlab)
export const TokensSchema = z.record(
  z.string(), // e.g., "github", "gitlab.com", "gitlab.company.com"
  z.string()  // token value
);
export type Tokens = z.infer<typeof TokensSchema>;

// Local config (.grekt/config.yaml) - gitignored, contains registry configs, session, and tokens
export const LocalConfigSchema = z.object({
  // Registry backends for artifacts with scope (@scope/name)
  registries: z.record(
    z.string().regex(/^@/, "Registry scope must start with @"),
    RegistryEntrySchema
  ).optional(),

  // Session for the public registry (grekt login)
  session: StoredSessionSchema.optional(),

  // Tokens for git sources (github:owner/repo, gitlab:owner/repo)
  tokens: TokensSchema.optional(),
});
export type LocalConfig = z.infer<typeof LocalConfigSchema>;

// Component types for the artifact index
export const ComponentTypeSchema = z.enum(CATEGORIES);
export type ComponentType = z.infer<typeof ComponentTypeSchema>;

// Workspace config (grekt-workspace.yaml) - monorepo artifact coordination
export const WorkspaceConfigSchema = z.object({
  workspaces: z.array(z.string()).min(1, "At least one workspace glob is required"),
});
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

// Index entry for a single artifact (flat list, no categories)
export const IndexEntrySchema = z.object({
  artifactId: z.string(), // @scope/name
  keywords: KeywordsSchema,
  mode: ArtifactModeSchema, // core or lazy
});
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

// Flat artifact index structure
export const ArtifactIndexSchema = z.object({
  version: z.literal(1),
  entries: z.array(IndexEntrySchema).default([]),
});
export type ArtifactIndex = z.infer<typeof ArtifactIndexSchema>;
