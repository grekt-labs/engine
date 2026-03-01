import { describe, test, expect } from "vitest";
import {
  parseArtifactId,
  getDefaultHost,
  resolveRegistry,
  resolveRegistryForArtifact,
} from "./resolver";
import { createMockTokenProvider } from "#/test-utils/mocks";
import type { LocalConfig } from "./registry.types";

const DEFAULT_HOST = "registry.grekt.com";
const GITLAB_HOST = "gitlab.com";
const GITHUB_HOST = "ghcr.io"; // GitHub Container Registry for OCI artifacts

describe("parseArtifactId", () => {
  test("parses @scope/name", () => {
    const result = parseArtifactId("@myorg/tool");

    expect(result.scope).toBe("@myorg");
    expect(result.name).toBe("tool");
    expect(result.artifactId).toBe("@myorg/tool");
    expect(result.version).toBeUndefined();
  });

  test("adds @ prefix to scope without it", () => {
    const result = parseArtifactId("org/tool");

    expect(result.scope).toBe("@org");
    expect(result.artifactId).toBe("@org/tool");
  });

  test("extracts version from @scope/name@version", () => {
    const result = parseArtifactId("@scope/pkg@2.0.0");

    expect(result.artifactId).toBe("@scope/pkg");
    expect(result.version).toBe("2.0.0");
  });

  test("handles prerelease versions", () => {
    expect(parseArtifactId("@s/p@1.0.0-alpha.1").version).toBe("1.0.0-alpha.1");
    expect(parseArtifactId("@s/p@1.0.0-rc.2+build").version).toBe("1.0.0-rc.2+build");
  });

  test("handles hyphenated names", () => {
    const result = parseArtifactId("@my-org/my-tool");

    expect(result.scope).toBe("@my-org");
    expect(result.name).toBe("my-tool");
  });

  describe("invalid formats", () => {
    test.each([
      ["", "empty string"],
      ["just-name", "no scope"],
      ["@scope", "only scope"],
      ["@/name", "empty scope"],
      ["@scope/", "empty name"],
    ])("throws on %s (%s)", (input) => {
      expect(() => parseArtifactId(input)).toThrow(/Invalid artifact ID/);
    });
  });
});

describe("getDefaultHost", () => {
  test("returns correct defaults for each type", () => {
    expect(getDefaultHost("default")).toBe(DEFAULT_HOST);
    expect(getDefaultHost("gitlab")).toBe(GITLAB_HOST);
    expect(getDefaultHost("github")).toBe(GITHUB_HOST);
  });
});

describe("resolveRegistry", () => {
  test("returns default registry when config is null", () => {
    const result = resolveRegistry("@scope", null);

    expect(result.type).toBe("default");
    expect(result.host).toBe(DEFAULT_HOST);
  });

  test("returns default registry for unknown scope", () => {
    const config: LocalConfig = {
      registries: { "@other": { type: "gitlab", project: "p" } },
    };

    const result = resolveRegistry("@unknown", config);

    expect(result.type).toBe("default");
  });

  test("uses config for matching scope", () => {
    const config: LocalConfig = {
      registries: {
        "@org": { type: "gitlab", project: "org/artifacts", host: "gitlab.corp.com" },
      },
    };

    const result = resolveRegistry("@org", config);

    expect(result.type).toBe("gitlab");
    expect(result.host).toBe("gitlab.corp.com");
    expect(result.project).toBe("org/artifacts");
  });

  test("applies default host when not specified", () => {
    const config: LocalConfig = {
      registries: { "@org": { type: "gitlab", project: "p" } },
    };

    expect(resolveRegistry("@org", config).host).toBe(GITLAB_HOST);
  });

  test("includes prefix in resolved registry", () => {
    const config: LocalConfig = {
      registries: {
        "@org": { type: "gitlab", project: "org/artifacts", prefix: "frontend" },
      },
    };

    const result = resolveRegistry("@org", config);

    expect(result.prefix).toBe("frontend");
  });

  test("prefix is undefined when not specified", () => {
    const config: LocalConfig = {
      registries: { "@org": { type: "gitlab", project: "p" } },
    };

    expect(resolveRegistry("@org", config).prefix).toBeUndefined();
  });

  describe("token resolution", () => {
    test("uses token from config", () => {
      const config: LocalConfig = {
        registries: { "@org": { type: "gitlab", project: "p", token: "cfg-token" } },
      };

      expect(resolveRegistry("@org", config).token).toBe("cfg-token");
    });

    test("falls back to TokenProvider for gitlab", () => {
      const config: LocalConfig = {
        registries: { "@org": { type: "gitlab", project: "p", host: "gl.corp.com" } },
      };
      const tokens = createMockTokenProvider({
        git: { gitlab: { "gl.corp.com": "provider-token" } },
      });

      expect(resolveRegistry("@org", config, tokens).token).toBe("provider-token");
    });

    test("falls back to TokenProvider for github", () => {
      const config: LocalConfig = {
        registries: { "@org": { type: "github", project: "p" } },
      };
      const tokens = createMockTokenProvider({
        git: { github: "gh-token" },
      });

      expect(resolveRegistry("@org", config, tokens).token).toBe("gh-token");
    });

    test("prefers config token over TokenProvider", () => {
      const config: LocalConfig = {
        registries: { "@org": { type: "gitlab", project: "p", token: "config" } },
      };
      const tokens = createMockTokenProvider({
        git: { gitlab: { [GITLAB_HOST]: "provider" } },
      });

      expect(resolveRegistry("@org", config, tokens).token).toBe("config");
    });
  });
});

describe("resolveRegistryForArtifact", () => {
  test("parses artifact and resolves registry in one call", () => {
    const config: LocalConfig = {
      registries: { "@org": { type: "gitlab", project: "org/artifacts" } },
    };

    const result = resolveRegistryForArtifact("@org/tool@1.0.0", config);

    expect(result.artifactId).toBe("@org/tool");
    expect(result.version).toBe("1.0.0");
    expect(result.registry.type).toBe("gitlab");
  });

  test("handles artifact without version", () => {
    const result = resolveRegistryForArtifact("@scope/name", null);

    expect(result.version).toBeUndefined();
    expect(result.registry.type).toBe("default");
  });
});
