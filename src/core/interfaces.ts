/**
 * Core interfaces for dependency injection.
 * These abstract away I/O operations for testability and portability.
 */

export interface FileSystem {
  readFile(path: string): string;
  readFileBinary(path: string): Buffer;
  writeFile(path: string, content: string): void;
  writeFileBinary(path: string, content: Buffer): void;
  exists(path: string): boolean;
  mkdir(path: string, options?: { recursive?: boolean }): void;
  readdir(path: string): string[];
  stat(path: string): { isDirectory: boolean; isFile: boolean; size: number };
  unlink(path: string): void;
  rmdir(path: string, options?: { recursive?: boolean }): void;
  copyFile(src: string, dest: string): void;
  /**
   * Create a symbolic link at `path` pointing to `target`.
   * Callers MUST validate that both paths are absolute and resolve
   * within expected project boundaries before calling this method.
   */
  symlink(target: string, path: string): void;
  rename(src: string, dest: string): void;
}

export interface HttpClient {
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * Shell command executor using array-based arguments.
 *
 * BREAKING CHANGE (security): Changed from exec(command: string) to execFile(command, args[]).
 * This prevents shell injection attacks by passing arguments directly to the executable
 * without shell interpretation. Callers must update to pass command and args separately.
 *
 * Before: shell.exec("tar -xzf file.tar.gz")
 * After:  shell.execFile("tar", ["-xzf", "file.tar.gz"])
 */
export interface ShellExecutor {
  execFile(command: string, args: string[]): string;
}

export interface TokenProvider {
  getRegistryToken(scope: string): string | undefined;
  getGitToken(type: 'github' | 'gitlab', host?: string): string | undefined;
}

export interface PathConfig {
  projectRoot: string;
  artifactsDir: string;
  configFile: string;
  lockFile: string;
  localConfigFile: string;
}

export interface EngineContext {
  fs: FileSystem;
  http: HttpClient;
  shell: ShellExecutor;
  tokens: TokenProvider;
  paths: PathConfig;
}
