import { describe, test, expect } from "bun:test";
import { parseSource, getSourceDisplayName } from "./sources";

describe("sources", () => {
  describe("parseSource", () => {
    test("returns registry type for @scope/name", () => {
      const result = parseSource("@author/artifact");

      expect(result.type).toBe("registry");
      expect(result.identifier).toBe("@author/artifact");
      expect(result.raw).toBe("@author/artifact");
      expect(result.ref).toBeUndefined();
    });

    test("returns registry type for plain name", () => {
      const result = parseSource("some-name");

      expect(result.type).toBe("registry");
      expect(result.identifier).toBe("some-name");
    });

    test("returns github type for github:owner/repo", () => {
      const result = parseSource("github:owner/repo");

      expect(result.type).toBe("github");
      expect(result.identifier).toBe("owner/repo");
      expect(result.ref).toBeUndefined();
      expect(result.raw).toBe("github:owner/repo");
    });

    test("returns github type with ref from hash", () => {
      const result = parseSource("github:owner/repo#v1.0.0");

      expect(result.type).toBe("github");
      expect(result.identifier).toBe("owner/repo");
      expect(result.ref).toBe("v1.0.0");
    });

    test("returns github type with branch ref", () => {
      const result = parseSource("github:owner/repo#feature/branch");

      expect(result.type).toBe("github");
      expect(result.identifier).toBe("owner/repo");
      expect(result.ref).toBe("feature/branch");
    });

    test("returns gitlab type for gitlab:owner/repo", () => {
      const result = parseSource("gitlab:owner/repo");

      expect(result.type).toBe("gitlab");
      expect(result.identifier).toBe("owner/repo");
      expect(result.host).toBe("gitlab.com");
      expect(result.ref).toBeUndefined();
    });

    test("returns gitlab type with ref", () => {
      const result = parseSource("gitlab:owner/repo#main");

      expect(result.type).toBe("gitlab");
      expect(result.identifier).toBe("owner/repo");
      expect(result.ref).toBe("main");
      expect(result.host).toBe("gitlab.com");
    });

    test("returns gitlab type with custom host", () => {
      const result = parseSource("gitlab:gitlab.mycompany.com/owner/repo");

      expect(result.type).toBe("gitlab");
      expect(result.identifier).toBe("owner/repo");
      expect(result.host).toBe("gitlab.mycompany.com");
      expect(result.ref).toBeUndefined();
    });

    test("returns gitlab type with custom host and ref", () => {
      const result = parseSource("gitlab:gitlab.mycompany.com/group/subgroup/project#v2.0.0");

      expect(result.type).toBe("gitlab");
      expect(result.identifier).toBe("group/subgroup/project");
      expect(result.host).toBe("gitlab.mycompany.com");
      expect(result.ref).toBe("v2.0.0");
    });

    test("handles gitlab nested groups", () => {
      const result = parseSource("gitlab:group/subgroup/project");

      expect(result.type).toBe("gitlab");
      expect(result.identifier).toBe("group/subgroup/project");
      expect(result.host).toBe("gitlab.com");
    });

    test("returns local type for relative path", () => {
      const result = parseSource("./my-skills");

      expect(result.type).toBe("local");
      expect(result.identifier).toBe("./my-skills");
      expect(result.raw).toBe("./my-skills");
    });

    test("returns local type for parent relative path", () => {
      const result = parseSource("../other/skills");

      expect(result.type).toBe("local");
      expect(result.identifier).toBe("../other/skills");
    });

    test("returns local type for absolute path", () => {
      const result = parseSource("/home/user/skills");

      expect(result.type).toBe("local");
      expect(result.identifier).toBe("/home/user/skills");
    });

    test("returns local type for home-relative path", () => {
      const result = parseSource("~/my-skills");

      expect(result.type).toBe("local");
      expect(result.identifier).toBe("~/my-skills");
    });

    test("preserves raw source string", () => {
      const source = "github:owner/repo#v1.0.0";
      const result = parseSource(source);

      expect(result.raw).toBe(source);
    });
  });

  describe("getSourceDisplayName", () => {
    test("formats registry source correctly", () => {
      const source = parseSource("@author/artifact");
      const display = getSourceDisplayName(source);

      expect(display).toBe("@author/artifact");
    });

    test("formats github source without ref", () => {
      const source = parseSource("github:owner/repo");
      const display = getSourceDisplayName(source);

      expect(display).toBe("github:owner/repo");
    });

    test("formats github source with ref", () => {
      const source = parseSource("github:owner/repo#v1.0.0");
      const display = getSourceDisplayName(source);

      expect(display).toBe("github:owner/repo#v1.0.0");
    });

    test("formats gitlab.com source without host prefix", () => {
      const source = parseSource("gitlab:owner/repo");
      const display = getSourceDisplayName(source);

      expect(display).toBe("gitlab:owner/repo");
    });

    test("formats gitlab.com source with ref", () => {
      const source = parseSource("gitlab:owner/repo#main");
      const display = getSourceDisplayName(source);

      expect(display).toBe("gitlab:owner/repo#main");
    });

    test("formats self-hosted gitlab with host prefix", () => {
      const source = parseSource("gitlab:gitlab.mycompany.com/owner/repo");
      const display = getSourceDisplayName(source);

      expect(display).toBe("gitlab:gitlab.mycompany.com/owner/repo");
    });

    test("formats self-hosted gitlab with host and ref", () => {
      const source = parseSource("gitlab:gitlab.mycompany.com/owner/repo#v1.0.0");
      const display = getSourceDisplayName(source);

      expect(display).toBe("gitlab:gitlab.mycompany.com/owner/repo#v1.0.0");
    });

    test("formats local source as path", () => {
      const source = parseSource("./my-skills");
      const display = getSourceDisplayName(source);

      expect(display).toBe("./my-skills");
    });
  });
});
