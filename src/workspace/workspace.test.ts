import { describe, expect, test } from "vitest";
import type { FileSystem } from "#/core";
import {
  parseWorkspaceConfig,
  isWorkspaceRoot,
  findWorkspaceRoot,
  loadArtifactManifest,
  discoverWorkspaceArtifacts,
  getWorkspaceContext,
} from "./workspace";

function createMockFs(files: Record<string, string>): FileSystem {
  return {
    readFile: (path: string) => {
      if (!(path in files)) throw new Error(`File not found: ${path}`);
      return files[path]!;
    },
    readFileBinary: (path: string) => Buffer.from(files[path] || ""),
    writeFile: () => {},
    writeFileBinary: () => {},
    exists: (path: string) => path in files,
    mkdir: () => {},
    readdir: () => [],
    stat: () => ({ isDirectory: true, isFile: false, size: 0 }),
    unlink: () => {},
    rmdir: () => {},
    copyFile: () => {},
    rename: () => {},
  };
}

describe("parseWorkspaceConfig", () => {
  test("parses valid workspace config", () => {
    const content = `workspaces:
  - "backend/*"
  - "frontend/*"
`;
    const result = parseWorkspaceConfig(content);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workspaces).toEqual(["backend/*", "frontend/*"]);
    }
  });

  test("returns error on empty workspaces array", () => {
    const content = `workspaces: []`;
    const result = parseWorkspaceConfig(content);
    expect(result.success).toBe(false);
  });

  test("returns error on missing workspaces field", () => {
    const content = `something: else`;
    const result = parseWorkspaceConfig(content);
    expect(result.success).toBe(false);
  });
});

describe("isWorkspaceRoot", () => {
  test("returns true when grekt-workspace.yaml exists", () => {
    const fs = createMockFs({
      "/project/grekt-workspace.yaml": "workspaces: []",
    });
    expect(isWorkspaceRoot(fs, "/project")).toBe(true);
  });

  test("returns false when no workspace config", () => {
    const fs = createMockFs({});
    expect(isWorkspaceRoot(fs, "/project")).toBe(false);
  });
});

describe("findWorkspaceRoot", () => {
  test("finds workspace root from nested directory", () => {
    const fs = createMockFs({
      "/project/grekt-workspace.yaml": "workspaces: []",
    });
    expect(findWorkspaceRoot(fs, "/project/backend/auth")).toBe("/project");
  });

  test("finds workspace root from root itself", () => {
    const fs = createMockFs({
      "/project/grekt-workspace.yaml": "workspaces: []",
    });
    expect(findWorkspaceRoot(fs, "/project")).toBe("/project");
  });

  test("returns undefined when not in workspace", () => {
    const fs = createMockFs({});
    expect(findWorkspaceRoot(fs, "/some/random/path")).toBeUndefined();
  });
});

describe("loadArtifactManifest", () => {
  test("loads valid manifest", () => {
    const fs = createMockFs({
      "/project/backend/grekt.yaml": `name: "@myorg/backend"
version: "1.0.0"
description: "Backend rules"
`,
    });
    const result = loadArtifactManifest(fs, "/project/backend");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("@myorg/backend");
      expect(result.data.version).toBe("1.0.0");
    }
  });

  test("returns error when no manifest", () => {
    const fs = createMockFs({});
    const result = loadArtifactManifest(fs, "/project/backend");
    expect(result.success).toBe(false);
  });

  test("returns error on invalid manifest", () => {
    const fs = createMockFs({
      "/project/backend/grekt.yaml": `invalid: yaml: content`,
    });
    const result = loadArtifactManifest(fs, "/project/backend");
    expect(result.success).toBe(false);
  });
});

describe("discoverWorkspaceArtifacts", () => {
  test("discovers artifacts from expanded paths", () => {
    const fs = createMockFs({
      "/project/backend/auth/grekt.yaml": `name: "@myorg/auth"
version: "1.0.0"
description: "Auth rules"
`,
      "/project/backend/api/grekt.yaml": `name: "@myorg/api"
version: "2.0.0"
description: "API rules"
`,
    });

    const result = discoverWorkspaceArtifacts(fs, "/project", [
      "/project/backend/auth",
      "/project/backend/api",
    ]);

    expect(result.root).toBe("/project");
    expect(result.artifacts).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);

    const names = result.artifacts.map((a) => a.manifest.name);
    expect(names).toContain("@myorg/auth");
    expect(names).toContain("@myorg/api");
  });

  test("reports warnings for invalid artifacts", () => {
    const fs = createMockFs({
      "/project/backend/valid/grekt.yaml": `name: "@myorg/valid"
version: "1.0.0"
description: "Valid"
`,
    });

    const result = discoverWorkspaceArtifacts(fs, "/project", [
      "/project/backend/valid",
      "/project/backend/invalid",
    ]);

    expect(result.artifacts).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("/project/backend/invalid");
  });

  test("includes relative paths", () => {
    const fs = createMockFs({
      "/project/backend/deep/nested/grekt.yaml": `name: "@myorg/nested"
version: "1.0.0"
description: "Nested"
`,
    });

    const result = discoverWorkspaceArtifacts(fs, "/project", [
      "/project/backend/deep/nested",
    ]);

    expect(result.artifacts[0]?.relativePath).toBe("backend/deep/nested");
  });
});

describe("getWorkspaceContext", () => {
  test("returns isWorkspace false when not in workspace", () => {
    const fs = createMockFs({});
    const context = getWorkspaceContext(fs, "/some/path");
    expect(context.isWorkspace).toBe(false);
  });

  test("returns workspace context when in workspace", () => {
    const fs = createMockFs({
      "/project/grekt-workspace.yaml": "workspaces: []",
    });
    const context = getWorkspaceContext(fs, "/project/backend");
    expect(context.isWorkspace).toBe(true);
    expect(context.workspaceRoot).toBe("/project");
  });

  test("identifies current artifact from expanded paths", () => {
    const fs = createMockFs({
      "/project/grekt-workspace.yaml": "workspaces: []",
      "/project/backend/grekt.yaml": `name: "@myorg/backend"
version: "1.0.0"
description: "Backend"
`,
    });
    const context = getWorkspaceContext(fs, "/project/backend", [
      "/project/backend",
      "/project/frontend",
    ]);
    expect(context.isWorkspace).toBe(true);
    expect(context.currentArtifact?.manifest.name).toBe("@myorg/backend");
  });

  test("identifies current artifact without expanded paths", () => {
    const fs = createMockFs({
      "/project/grekt-workspace.yaml": "workspaces: []",
      "/project/backend/grekt.yaml": `name: "@myorg/backend"
version: "1.0.0"
description: "Backend"
`,
    });
    const context = getWorkspaceContext(fs, "/project/backend");
    expect(context.currentArtifact?.manifest.name).toBe("@myorg/backend");
  });
});
