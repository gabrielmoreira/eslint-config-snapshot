# ESLint Config Snapshotter

Deterministic CLI to capture and compare effective ESLint rule state across workspaces.

Repository: `https://github.com/gabrielmoreira/eslint-config-snapshotter`

## Why

- Detect meaningful ESLint rule drift over time.
- Keep snapshots deterministic and review-friendly.
- Resolve ESLint per workspace, not from repo root fallback.

## What It Does

- Discovers workspaces or accepts manual workspace list.
- Assigns workspaces to ordered match groups (supports negative globs).
- Samples representative files per workspace.
- Runs workspace-scoped `eslint --print-config`.
- Aggregates final rule state per group.
- Writes and compares minimal JSON snapshots.

## Install

```bash
pnpm install
```

## Validate

```bash
pnpm nx run-many -t build
pnpm nx run-many -t lint
pnpm nx run-many -t typecheck
pnpm nx run-many -t test
```

## CLI Usage

Run built CLI:

```bash
node packages/cli/dist/index.js <command>
```

Commands:

- `snapshot`
- `compare`
- `status`
- `print`
- `init`
- `help`

Help output (`--help`):

```text
eslint-config-snapshotter

Usage:
  eslint-config-snapshotter <command>

Commands:
  snapshot   Compute and write snapshots to .eslint-config-snapshots/
  compare    Compare current state against stored snapshots
  status     Print minimal status (clean/changes)
  print      Print aggregated rules JSON to stdout
  init       Create eslint-config-snapshotter.config.mjs
  help       Show this help

Options:
  -h, --help Show this help
```

## Config Loading

Config uses `cosmiconfig` and supports:

- SPEC-priority files:
- `.eslint-config-snapshotter.js`
- `.eslint-config-snapshotter.cjs`
- `.eslint-config-snapshotter.mjs`
- `eslint-config-snapshotter.config.js`
- `eslint-config-snapshotter.config.cjs`
- `eslint-config-snapshotter.config.mjs`
- Additional cosmiconfig places:
- `package.json` (`eslint-config-snapshotter` field)
- `.eslint-config-snapshotterrc*` variants (`json`, `yaml`, `yml`, `js`, `cjs`, `mjs`)

The default configuration is in `packages/config/src/index.ts` (`DEFAULT_CONFIG`).

## Snapshot Output

Files are written under `.eslint-config-snapshots/`.

Each snapshot contains only:

- `formatVersion`
- `groupId`
- `workspaces`
- `rules`

No timestamps, hashes, sampled paths, env metadata, or absolute paths are stored.

## Developer Workflow

### Fast local CLI from source (recommended)

Use source directly so you never run stale compiled output:

```bash
pnpm cli:dev -- --help
pnpm cli:dev -- snapshot
pnpm cli:dev -- compare
```

Examples from repository root:

```bash
pnpm cli:dev -- snapshot
pnpm cli:dev -- status
pnpm cli:dev -- print
```

This executes `packages/cli/src/index.ts` via `tsx`.

### Built CLI check

If you want parity with distributable behavior:

```bash
pnpm nx run cli:build
node packages/cli/dist/index.js --help
```

## Integration Testing Notes

- `packages/cli/test/fixtures/repo`: deterministic fixture with workspace-local ESLint bins.
- `packages/cli/test/fixtures/npm-isolated-template`: isolated npm-based fixture.
- `packages/cli/test/cli.npm-isolated.integration.test.ts` runs commands in isolated subprocesses and installs workspace-local `eslint` via `npm` inside each subproject.

## Exit Codes

- `snapshot`: `0` on success
- `compare`: `0` when clean, `1` when changes exist
- `status`: `0` when clean, `1` when changes exist
- `print`: `0`
- `init`: `0` on success, `1` on error

## Package Layout

- `packages/core`: normalization/canonicalization/sorting helpers
- `packages/workspace`: discovery and grouping
- `packages/sampling`: deterministic file sampling
- `packages/extract`: workspace-scoped eslint resolution + print-config extraction
- `packages/snapshot`: snapshot model/read/write/aggregation
- `packages/diff`: snapshot diffing
- `packages/config`: config loading/merging/defaults
- `packages/api`: public exports
- `packages/cli`: command orchestration

## Authoritative Docs

- `SPEC.md` (source of truth)
- `AGENTS.md`
- `TASKS.md`
