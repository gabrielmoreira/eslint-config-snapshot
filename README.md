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
node packages/cli/dist/index.js [command]
```

No command defaults to `check` (human summary diff output).

Commands:

- `check` (canonical)
- `update` (canonical)
- `print`
- `init`
- compatibility aliases: `snapshot`, `compare`, `status`, `what-changed`
- `help`

Useful print option:
- `print --short` for compact human-readable output (line-oriented by rule).
Useful global option:
- `-u, --update` updates snapshots from default mode without typing `update`.

Help output (`--help`):

```text
Usage: eslint-config-snapshotter [options] [command]

Options:
  -u, --update     Update snapshots (default mode only)
  -h, --help       display help for command

Commands:
  check [options]  Compare current state against stored snapshots
  update|snapshot  Compute and write snapshots to .eslint-config-snapshots/
  print [options]  Print aggregated rules
  init             Create eslint-config-snapshotter.config.mjs
  help [command]   display help for command
```

## Config Loading

Config loading uses `cosmiconfig` with deterministic ordered `searchPlaces` (first match wins):
- `.eslint-config-snapshotter.js`
- `.eslint-config-snapshotter.cjs`
- `.eslint-config-snapshotter.mjs`
- `eslint-config-snapshotter.config.js`
- `eslint-config-snapshotter.config.cjs`
- `eslint-config-snapshotter.config.mjs`
- `package.json` (`eslint-config-snapshotter` field)
- `.eslint-config-snapshotterrc`
- `.eslint-config-snapshotterrc.json`
- `.eslint-config-snapshotterrc.yaml`
- `.eslint-config-snapshotterrc.yml`
- `.eslint-config-snapshotterrc.js`
- `.eslint-config-snapshotterrc.cjs`
- `.eslint-config-snapshotterrc.mjs`

Config may export an object, function, or async function.

Default configuration lives in `packages/api/src/config.ts` (`DEFAULT_CONFIG`).

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
pnpm cli:dev -- update
pnpm cli:dev -- check
```

Examples from repository root:

```bash
pnpm cli:dev -- update
pnpm cli:dev -- check --format status
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
- `packages/cli/test/cli.pnpm-isolated.integration.test.ts`: isolated pnpm install per workspace.
- `packages/cli/test/cli.npm-isolated.integration.test.ts` runs commands in isolated subprocesses and installs workspace-local `eslint` via `npm` inside each subproject.
- `packages/cli/test/cli.terminal.integration.test.ts` runs the built CLI from a real terminal process and compares command outputs to expected values.
- `packages/cli/test/cli.integration.test.ts` includes ordered grouped matching and standalone grouping behavior.

## Exit Codes

- `update`/`snapshot`: `0` on success
- `check`: `0` when clean, `1` when changes exist
- `check --format status`: `0` when clean, `1` when changes exist
- `print`: `0`
- `init`: `0` on success, `1` on error

## Package Layout

- `packages/api`: public API plus internal modules for core/config/workspace/sampling/extract/snapshot/diff
- `packages/cli`: command orchestration and terminal interface

## Authoritative Docs

- `docs/SPEC.md` (base specification)
- `docs/SPEC_ENHANCED.md` (required staged enhancements/deviations)
- `docs/AGENTS.md`
- `docs/TASKS.md`
