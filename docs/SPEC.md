# ESLint Config Snapshot

## Specification Authority

`SPEC.md` is the primary technical specification.

`SPEC_ENHANCED.md` is a staging document and may contain temporary additions before promotion into `SPEC.md`.

Implementation must follow `SPEC.md`. If `SPEC_ENHANCED.md` has active items, those items apply in addition to this document.

---

## 0. Overview

ESLint Config Snapshot is a deterministic CLI for capturing and comparing the effective ESLint rule state across workspaces.

It does not lint files. It resolves ESLint config via `--print-config`, aggregates rule state, and persists minimal snapshots for drift detection.

Goals:

- deterministic output across OS and machines
- stable Git diffs
- minimal snapshot data
- workspace-scoped ESLint resolution
- predictable CLI behavior

---

## 1. Core Principles

- Determinism: identical repository state produces identical snapshots.
- Minimal snapshots: store only stable, meaningful rule state.
- No volatile metadata: no timestamps, hashes, sampled file paths, env info, versions, or absolute paths.
- Stable ordering: keys and arrays must be sorted deterministically.
- Workspace isolation: ESLint is resolved and executed per workspace.

---

## 2. Monorepo Architecture

The project is a TypeScript monorepo with pnpm + Nx and two publishable packages:

1. `@eslint-config-snapshot/api`
2. `@eslint-config-snapshot/cli`

All internal concerns (`core`, `config`, `workspace`, `sampling`, `extract`, `snapshot`, `diff`) live as internal modules inside `@eslint-config-snapshot/api`.

Each project must expose Nx targets:

- `build`
- `typecheck`
- `lint`
- `test`

---

## 3. Tooling Requirements

- Language: TypeScript
- Runtime: Node.js 20+
- Testing: Vitest
- Linting: ESLint
- Workspace discovery: `@manypkg/get-packages`
- File globbing: deterministic cross-platform glob engine (for example `fast-glob`)
- Config discovery: `cosmiconfig`

---

## 4. Configuration Discovery

Configuration loading must use `cosmiconfig`.

Supported configuration prefixes and entry points:

- `.eslint-config-snapshot*`
- `eslint-config-snapshot.config.*`
- `package.json` field: `eslint-config-snapshot`

Search order is `cosmiconfig` default behavior.
Search is constrained for determinism through an explicit `searchPlaces` list and bounded root resolution.

Config exports may be:

- object
- function returning object
- async function returning object

If no configuration is found, the CLI must proceed with built-in defaults (zero-config mode).

---

## 5. Workspace Input

Two modes are required:

- `discover` (default)
- `manual`

`discover` uses `@manypkg/get-packages`.

`manual` skips discovery and uses provided workspaces.

Workspace paths must be normalized, unique, and sorted.

---

## 6. Grouping

Grouping modes:

- `match` (default)
- `standalone`

`match` mode:

- ordered groups
- first match wins
- supports negative patterns (`!`)
- optional `allowEmptyGroups`

`standalone` mode:

- each workspace is its own group

---

## 7. ESLint Extraction

For each workspace, resolve ESLint from that workspace and execute:

`node <resolved-eslint-bin> --print-config <fileAbs>`

Execution must use `cwd=workspaceAbs`.

Sampling is deterministic and only used to obtain representative configs.

---

## 8. Snapshot Format

Snapshots are JSON with pretty print (indent 2), deterministic key ordering, and compact ESLint-style rule entries.

Snapshot files include only:

- `formatVersion`
- `groupId`
- `workspaces`
- `rules`

Snapshots must not include volatile metadata.

Rule entry encoding:

- A rule with one observed configuration is stored as a single compact ESLint-style entry.
- A rule with multiple observed runtime combinations is stored as an array of compact entries.
- Each variant is unique by `severity + options` combination and sorted deterministically.

---

## 9. CLI Contract

Canonical commands:

- default invocation (no command): `check` summary output
- `check`
- `update`
- `print`
- `config`
- `init`

Compatibility aliases:

- `snapshot` => `update`
- `compare` => `check --format diff`
- `status` => `check --format status`
- `what-changed` => `check --format summary`

Options:

- `-u, --update` for default invocation update flow
- `check --format <summary|status|diff>`
- `print --format <json|short>` and `print --short`
- `config --format <json|short>` and `config --short`
- `init --target <file|package-json>`
- `init --preset <recommended|minimal|full>`
- `init --show-effective`
- `init -f, --force`
- `init -y, --yes`

Default-run behavior requirements:

- If no explicit config is found, continue using built-in defaults and show a non-blocking tip about optional `init`.
- If no baseline snapshot exists:
  - interactive terminal (default invocation or summary check): ask whether current state should be saved as baseline
  - non-interactive execution: exit non-zero with `--update` guidance
- Baseline refresh reminder tip (`--update`) should appear in high-signal contexts (drift detected, `status=changes`, or baseline creation), not in clean outputs.

CLI parsing/help generation should be command-metadata driven (for example via `commander`) and avoid duplicated hardcoded help blocks.

`init` conflict protection requirements:

- If an existing config is detected and `--force` is not provided, `init` must fail before writing any files and explain potential config conflicts.
- With `--force`, `init` may proceed with the selected target.

`init` interactive UX requirements:

- target selection should use interactive select prompts
- preset selection should use interactive select prompts
- interactive mode may accept equivalent text aliases
- recommended preset should clearly explain that default `*` is a dynamic catch-all for discovered workspaces
- recommended preset should support checkbox selection of exception workspaces and numeric group assignment for those selections
- recommended preset should keep a runtime-discovered default group (`**/*`) and place numbered static groups before it (first match wins)
- recommended preset output should avoid writing explicit sampling config unless user chooses `full`
- when no static overrides are selected in recommended preset, generated config should remain empty (`{}`) to preserve fully dynamic behavior

---

## 10. Testing and Quality Gates

Required:

- unit tests for api modules
- integration tests for CLI fixtures
- terminal-invoked CLI tests with output assertions
- coverage for positive and negative paths
- isolated package-manager scenarios (pnpm and npm)

Mandatory validation commands:

- `pnpm nx run-many -t build`
- `pnpm nx run-many -t lint`
- `pnpm nx run-many -t typecheck`
- `pnpm nx run-many -t test`

---

## 11. Cross-Platform Requirements

Must work on macOS, Linux, and Windows.

Path handling must normalize separators and avoid assumptions tied to one shell.

Hooks and automation scripts must use cross-platform Node-based execution.

---

## 12. Scope Boundary

This tool snapshots configured runtime rule state for the current project.

It does not enumerate the complete universe of potentially available rules across all installed plugins.
