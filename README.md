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
pnpm dlx @eslint-config-snapshot/cli@latest --update
```

```bash
npx @eslint-config-snapshot/cli@latest --update
```

Then run checks anytime:

```bash
pnpm dlx @eslint-config-snapshot/cli@latest
```

The check output always reminds you how to refresh baseline:

```bash
eslint-config-snapshot --update
```

Default command (no subcommand) runs `check` summary output.

## Setup Flow

1. `--update`: write baseline snapshots
2. `check` (or no command): detect drift
3. `--update`: refresh baseline after intentional changes

## First Run Behavior

- No config file/field found:
  - the CLI uses built-in defaults automatically
  - it prints a low-noise tip explaining that `init` is optional for customization
- No baseline snapshot found:
  - interactive terminal: asks whether current state should become baseline
  - non-interactive execution: exits with guidance to run `--update`

## Optional Init (Advanced)

`init` is optional and only needed if you want explicit custom config.

The default behavior works without a config file.

`init` provides a lightweight setup assistant:

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

## Scope Boundary

`eslint-config-snapshot` captures the effective rule runtime for your current project configuration.

It does **not** try to enumerate every rule that could exist across every installed ESLint plugin.

If you need a full rule catalog/inspection workflow, use ESLint inspector tooling directly (for example `eslint --inspect-config` and related inspector UI workflows).

## Troubleshooting

- You run without config and see workspace discovery failure:
  - create explicit config with `init` and define workspace input manually
- You see drift but expected none:
  - confirm dependency/config changes happened
  - refresh baseline with `eslint-config-snapshot --update` if changes are intentional

## Configuration

Main path: keep config minimal.

Advanced patterns and recipes are in:

- [`docs/EXAMPLES.md`](docs/EXAMPLES.md)

## Documentation

- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)
- [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md)
- [`docs/EXAMPLES.md`](docs/EXAMPLES.md)
- [`docs/IMPLEMENTATION_REVIEW.md`](docs/IMPLEMENTATION_REVIEW.md)
- [`docs/SPEC.md`](docs/SPEC.md)
- [`docs/SPEC_ENHANCED.md`](docs/SPEC_ENHANCED.md)
- [`docs/TASKS.md`](docs/TASKS.md)
- [`docs/AI_CHANGELOG.md`](docs/AI_CHANGELOG.md)
