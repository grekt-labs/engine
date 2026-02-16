/**
 * Test utilities - Mock factories for dependency injection interfaces
 */

import type { FileSystem, HttpClient, ShellExecutor, TokenProvider } from "#/core";

interface MockFileEntry {
  content: string | Buffer;
  isDirectory: boolean;
}

/**
 * Create a mock FileSystem with in-memory storage
 */
export function createMockFileSystem(
  initialFiles: Record<string, string | Buffer> = {}
): FileSystem & { files: Map<string, MockFileEntry> } {
  const files = new Map<string, MockFileEntry>();

  // Initialize with provided files
  for (const [path, content] of Object.entries(initialFiles)) {
    files.set(path, {
      content,
      isDirectory: false,
    });
  }

  return {
    files,

    readFile(path: string): string {
      const entry = files.get(path);
      if (!entry || entry.isDirectory) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return typeof entry.content === "string"
        ? entry.content
        : entry.content.toString("utf-8");
    },

    readFileBinary(path: string): Buffer {
      const entry = files.get(path);
      if (!entry || entry.isDirectory) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return typeof entry.content === "string"
        ? Buffer.from(entry.content)
        : entry.content;
    },

    writeFile(path: string, content: string): void {
      files.set(path, { content, isDirectory: false });
    },

    writeFileBinary(path: string, content: Buffer): void {
      files.set(path, { content, isDirectory: false });
    },

    exists(path: string): boolean {
      return files.has(path);
    },

    mkdir(path: string, _options?: { recursive?: boolean }): void {
      if (!files.has(path)) {
        files.set(path, { content: "", isDirectory: true });
      }
    },

    readdir(path: string): string[] {
      const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
      const results: Set<string> = new Set();

      for (const filePath of files.keys()) {
        if (filePath.startsWith(normalizedPath + "/")) {
          const relativePath = filePath.slice(normalizedPath.length + 1);
          const firstPart = relativePath.split("/")[0];
          if (firstPart) {
            results.add(firstPart);
          }
        }
      }

      return Array.from(results);
    },

    stat(path: string): { isDirectory: boolean; isFile: boolean; size: number } {
      const entry = files.get(path);
      if (!entry) {
        // Check if it's a directory by looking for children
        const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
        for (const filePath of files.keys()) {
          if (filePath.startsWith(normalizedPath + "/")) {
            return { isDirectory: true, isFile: false, size: 0 };
          }
        }
        throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
      }

      if (entry.isDirectory) {
        return { isDirectory: true, isFile: false, size: 0 };
      }

      const size =
        typeof entry.content === "string"
          ? entry.content.length
          : entry.content.length;

      return { isDirectory: false, isFile: true, size };
    },

    unlink(path: string): void {
      files.delete(path);
    },

    rmdir(path: string, _options?: { recursive?: boolean }): void {
      const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
      for (const filePath of files.keys()) {
        if (filePath === normalizedPath || filePath.startsWith(normalizedPath + "/")) {
          files.delete(filePath);
        }
      }
    },

    copyFile(src: string, dest: string): void {
      const entry = files.get(src);
      if (!entry) {
        throw new Error(`ENOENT: no such file or directory, copyfile '${src}'`);
      }
      files.set(dest, { ...entry });
    },

    symlink(target: string, path: string): void {
      if (!target.startsWith("/") || !path.startsWith("/")) {
        throw new Error("Symlink requires absolute paths for both target and link path");
      }
      const entry = files.get(target);
      if (!entry) {
        throw new Error(`ENOENT: no such file or directory, symlink '${target}'`);
      }
      files.set(path, { ...entry });
    },

    rename(src: string, dest: string): void {
      const entry = files.get(src);
      if (!entry) {
        throw new Error(`ENOENT: no such file or directory, rename '${src}'`);
      }
      files.set(dest, entry);
      files.delete(src);
    },
  };
}

/**
 * Create a mock HttpClient with predefined responses
 */
export function createMockHttpClient(
  responses: Map<string, Response | (() => Response)> = new Map()
): HttpClient & { responses: Map<string, Response | (() => Response)> } {
  return {
    responses,

    async fetch(url: string, _options?: RequestInit): Promise<Response> {
      const responseOrFactory = responses.get(url);

      if (!responseOrFactory) {
        return new Response(null, {
          status: 404,
          statusText: "Not Found",
        });
      }

      return typeof responseOrFactory === "function"
        ? responseOrFactory()
        : responseOrFactory;
    },
  };
}

/**
 * Recorded shell execution call
 */
interface ShellCall {
  command: string;
  args: string[];
}

/**
 * Create a mock ShellExecutor with predefined command outputs.
 * Matching is done against the command name, not the full command string.
 */
export function createMockShellExecutor(
  results: Record<string, string | Error> = {}
): ShellExecutor & { calls: ShellCall[]; commands: string[] } {
  const calls: ShellCall[] = [];
  // Keep commands array for backwards compatibility in tests
  const commands: string[] = [];

  return {
    calls,
    commands,

    execFile(command: string, args: string[]): string {
      calls.push({ command, args });
      // Store full command string for backwards compat
      commands.push(`${command} ${args.join(" ")}`);

      // Find matching command by name
      for (const [pattern, result] of Object.entries(results)) {
        if (command === pattern) {
          if (result instanceof Error) {
            throw result;
          }
          return result;
        }
      }

      // Default: return empty string (command succeeded)
      return "";
    },
  };
}

/**
 * Create a mock TokenProvider
 */
export function createMockTokenProvider(tokens: {
  registry?: Record<string, string>;
  git?: { github?: string; gitlab?: Record<string, string> };
} = {}): TokenProvider {
  return {
    getRegistryToken(scope: string): string | undefined {
      return tokens.registry?.[scope];
    },

    getGitToken(type: "github" | "gitlab", host?: string): string | undefined {
      if (type === "github") {
        return tokens.git?.github;
      }
      if (type === "gitlab" && host) {
        return tokens.git?.gitlab?.[host];
      }
      return tokens.git?.gitlab?.["gitlab.com"];
    },
  };
}

/**
 * Helper to create a successful JSON response
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Helper to create an error response
 */
export function errorResponse(status: number, statusText: string): Response {
  return new Response(null, { status, statusText });
}

/**
 * Helper to create a binary response
 */
export function binaryResponse(data: Buffer | Uint8Array, status = 200): Response {
  return new Response(data as unknown as BodyInit, {
    status,
    headers: { "Content-Type": "application/octet-stream" },
  });
}
