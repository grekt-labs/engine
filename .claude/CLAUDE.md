**MANDATORY:** Read `.grekt/index` at session start to discover tools that will help with the user's tasks. Use them when relevant. NEVER modify files inside `.grekt/`.

# grekt CLI Engine

Core logic for the grekt CLI. Pure functions, no I/O, fully testable.

## Purpose

This package contains the deterministic, portable logic extracted from the CLI:
- Schemas (Zod validation)
- Formatters (pure utilities)
- Artifact operations (integrity, scanning, lockfile)
- Registry operations (resolve, download, publish)
- Sync operations (plugin system, content generation)

## Principles

1. **No I/O** - All file/network operations via injected interfaces
2. **Pure functions** - Same inputs produce same outputs
3. **Testable** - Easy to mock dependencies
4. **Portable** - Can run in CLI, tests, or other contexts

## Shared Rules

Shared rules are in the root grekt/.claude/rules/ directory.
