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

## Runtime Requirements

- Node.js `>=20`
- pnpm `>=10.29.3` (for workspace development)

This repository enforces engines strictly during install.

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
- choose preset: `recommended`, `minimal`, or `full`
- in `recommended`, the default group `*` is a dynamic catch-all (all discovered workspaces)
- in `recommended`, you only select exception workspaces, then assign static groups for those exceptions
- if no exceptions are selected, recommended writes an empty config (`{}`) and keeps everything fully dynamic

Recommended for most teams:

- target: `package-json`
- preset: `recommended`

You can also run it non-interactively:

```bash
pnpm dlx @eslint-config-snapshot/cli@latest init --yes --target package-json --preset recommended --show-effective
```

## Core Commands

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

## Snapshot Model

Snapshots are deterministic JSON and only store stable rule state:

- `formatVersion`
- `groupId`
- `workspaces`
- `rules`

No timestamps, hashes, absolute paths, sampled files, or env noise.

## Output Glossary

- `changed groups`: snapshot groups with at least one detected difference.
- `introduced rules`: rules now present that were not in baseline.
- `removed rules`: rules that existed in baseline and are now absent.
- `severity changes`: rules whose level changed (`off`, `warn`, `error`).
- `options changes`: rules with same severity but different options.
- `workspace membership changes`: workspaces moving in or out of a snapshot group.

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

### Debug Logs

Enable detailed diagnostics only when needed:

```bash
DEBUG=eslint-config-snapshot:* npx @eslint-config-snapshot/cli@latest
```

This prints:

- sampled file counts and selected file lists
- extraction mode and executed `eslint --print-config` command details
- phase timings (workspace resolution, sampling, extraction, diff, total command time)

## Configuration

Main path: keep config minimal.

Advanced patterns and recipes are in:

- [`docs/EXAMPLES.md`](docs/EXAMPLES.md)

`sampling.tokenHints` means path/name-derived tokens used to prioritize representative sample files before regional fallback selection.

## Release Versioning (Changesets)

This repository uses Changesets so package versions and release tags stay aligned.

1. Create a release note:
   - `pnpm changeset`
2. Apply version bumps:
   - `pnpm release:version`
3. Commit version changes.
4. Create and push a release tag (`vX.Y.Z`).
5. GitHub publish workflow runs `changeset publish`.

## Documentation

- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)
- [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md)
- [`docs/EXAMPLES.md`](docs/EXAMPLES.md)
- [`docs/FINDINGS.md`](docs/FINDINGS.md)
- [`docs/SPEC.md`](docs/SPEC.md)
- [`docs/SPEC_ENHANCED.md`](docs/SPEC_ENHANCED.md)
- [`docs/TASKS.md`](docs/TASKS.md)
- [`docs/AI_CHANGELOG.md`](docs/AI_CHANGELOG.md)
