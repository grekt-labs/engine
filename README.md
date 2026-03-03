# @grekt/engine

Deterministic core logic for the grekt CLI. No I/O. No side effects. Fully injectable.

```bash
npm install @grekt/engine
```

## What this is

The engine behind [grekt](https://github.com/grekt-labs/cli) extracted into a standalone package. Every operation that doesn't touch the filesystem or network lives here.

- **Schemas** Zod validators for `grekt.yaml`, `grekt.lock`, artifact manifests, and every config format grekt uses
- **Artifact operations** frontmatter parsing, integrity verification, lockfile management, directory scanning
- **Registry operations** artifact resolution, download, publish, OCI distribution support
- **Sync operations** plugin system, content generation, target templates
- **Security** local scanning via AgentVerus
- **Utilities** semver parsing/comparison, byte/token/number formatters, workspace support

Full API reference at [developer.grekt.com](https://developer.grekt.com).

## Why it exists

grekt's CLI does I/O. This package does not. All file and network operations are injected through interfaces (`FileSystem`, `HttpClient`, `EngineContext`), which means:

- Runs on Node, Bun, Deno, or edge runtimes
- Test with mocks instead of real filesystems
- Same inputs, same outputs, every time

## Requirements

Node >= 18.0.0

## Usage

```ts
import { parseProjectConfig, resolveArtifact, createLockfile } from "@grekt/engine"
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports and feature requests welcome.

## License

[BSL 1.1](./LICENSE) free for personal and commercial use. The only restriction: don't use this code to build a competing AI artifact manager. Each version converts to MIT after two years. Details in [LICENSING.md](./LICENSING.md).
