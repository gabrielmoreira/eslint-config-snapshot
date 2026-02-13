# ESLint Config Snapshotter

Deterministic CLI to snapshot and compare effective ESLint rule state across workspaces.

## Quick Start

```bash
pnpm install
pnpm nx run-many -t build
```

Run from source:

```bash
pnpm cli:dev -- check
pnpm cli:dev -- update
```

Run built CLI:

```bash
node packages/cli/dist/index.js [command]
```

## Commands

Canonical commands:

- `check`
- `update`
- `print`
- `init`

Compatibility aliases:

- `snapshot` => `update`
- `compare` => `check --format diff`
- `status` => `check --format status`
- `what-changed` => `check --format summary`

Default invocation (no command) runs `check` summary output.

## Common Options

- `-u, --update` updates snapshots from default invocation.
- `check --format <summary|status|diff>`
- `print --format <json|short>`
- `print --short`

## Validation

```bash
pnpm nx run-many -t build
pnpm nx run-many -t lint
pnpm nx run-many -t typecheck
pnpm nx run-many -t test
```

## Snapshot Guarantees

Snapshots are deterministic JSON and include only:

- `formatVersion`
- `groupId`
- `workspaces`
- `rules`

No volatile metadata is stored.

## Documentation

- `docs/SPEC.md`
- `docs/SPEC_ENHANCED.md`
- `docs/AGENTS.md`
- `docs/TASKS.md`
- `docs/CONTRIBUTING.md`
- `docs/ai-updates/AI_CHANGELOG.md`
