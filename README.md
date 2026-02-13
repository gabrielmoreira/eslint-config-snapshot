# ESLint Config Snapshot

[![npm version](https://img.shields.io/npm/v/%40eslint-config-snapshot%2Fcli)](https://www.npmjs.com/package/@eslint-config-snapshot/cli)
[![npm downloads](https://img.shields.io/npm/dm/%40eslint-config-snapshot%2Fcli)](https://www.npmjs.com/package/@eslint-config-snapshot/cli)

Keep your ESLint policy healthy over time.

`eslint-config-snapshot` captures the effective ESLint rule set in your repo and tells you what drifted after dependency/config changes.

## Why it matters

ESLint ecosystems evolve fast. Plugins and presets add, remove, and retune rules all the time.

The common pain:

- your project drifts silently after upgrades
- new strict rules appear and nobody notices
- old assumptions about rule severity/config become outdated

This tool gives you a deterministic baseline and a fast answer to: "what changed in our lint policy?"

## Quick Start (No Install)

Use one of:

```bash
pnpm dlx @eslint-config-snapshot/cli@latest init
```

```bash
npx @eslint-config-snapshot/cli@latest init
```

Then create your first baseline:

```bash
pnpm dlx @eslint-config-snapshot/cli@latest --update
```

And run drift checks anytime:

```bash
pnpm dlx @eslint-config-snapshot/cli@latest
```

Default command (no subcommand) runs `check` summary output.

## Setup Flow

1. `init`: bootstrap config
2. `--update`: write baseline snapshots
3. `check` (or no command): detect drift

## Init behavior

`init` now supports a lightweight setup assistant.

- choose target: `file` or `package-json`
- choose preset: `minimal` or `full`

Recommended for most teams:

- target: `package-json`
- preset: `minimal`

You can also run it non-interactively:

```bash
pnpm dlx @eslint-config-snapshot/cli@latest init --yes --target package-json --preset minimal
```

## Core Commands

- `check`
- `update`
- `print`
- `init`

Compatibility aliases:

- `snapshot` => `update`
- `compare` => `check --format diff`
- `status` => `check --format status`
- `what-changed` => `check --format summary`

## Snapshot Model

Snapshots are deterministic JSON and only store stable rule state:

- `formatVersion`
- `groupId`
- `workspaces`
- `rules`

No timestamps, hashes, absolute paths, sampled files, or env noise.

## Configuration

Main path: keep config minimal.

Advanced patterns and recipes are in:

- `docs/EXAMPLES.md`

## Documentation

- `docs/CONTRIBUTING.md`
- `docs/EXAMPLES.md`
- `docs/SPEC.md`
