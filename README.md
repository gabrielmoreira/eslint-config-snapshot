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

## Proven On Large OSS Repos

The zero-config workflow is continuously smoke-tested against large, complex open-source repositories in CI:

- `vercel/next.js`
- `nrwl/nx`
- `facebook/react-native`
- `aws/aws-sdk-js`
- `oss-serverless/serverless`

This is not a formal guarantee for every repository shape, but it gives strong practical confidence that `eslint-config-snapshot` works out of the box on real-world monorepos.

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
- `catalog`
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
It can also inspect installed ESLint runtime/plugin packages via `catalog`, but that is still a best-effort discovery path.

It does **not** guarantee exhaustive enumeration of every possible rule across all plugin packaging styles and module export shapes.

If you need a full rule catalog/inspection workflow, use ESLint inspector tooling directly (for example `eslint --inspect-config` and related inspector UI workflows).

## Known Limitations

- The tool snapshots only rules that are effectively observed at runtime from sampled files.
- It does not build a complete catalog of all rules that could potentially be enabled across installed plugins.
- Sampling is deterministic but still heuristic-based by default, so very small or low-variance samples may miss config variability.
- As files evolve, sampled coverage can expose additional rule variants that were not represented in earlier baselines.
- For higher stability, define sampling rules explicitly in config (workspace grouping, include/exclude globs, and sampling settings).
- The default heuristic is intended to be a practical baseline for most repositories, but it is not exhaustive.

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
4. Push to `main`.
5. CI checks npm/local version drift and automatically dispatches `publish-npm.yml` when publishing is needed.
6. The publish workflow publishes via Changesets and creates/pushes `vX.Y.Z` automatically.

Manual publish dispatch (optional, requires `gh` auth):

- `pnpm release:run`
- optional watch mode: `pnpm release:run:watch`
- non-interactive watch mode (CI-friendly): `pnpm release:run:watch:ci`
- optional ref override: `pnpm release:run -- --ref main`
- optional custom run label: `pnpm release:run -- --label v0.14.1`
- default run label is inferred from root `package.json` version (for example `v0.14.1`)

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)
- [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md)
- [`docs/EXAMPLES.md`](docs/EXAMPLES.md)
- [`docs/FINDINGS.md`](docs/FINDINGS.md)
- [`docs/SPEC.md`](docs/SPEC.md)
- [`docs/SPEC_ENHANCED.md`](docs/SPEC_ENHANCED.md)
- [`docs/TASKS.md`](docs/TASKS.md)
- [`docs/AI_CHANGELOG.md`](docs/AI_CHANGELOG.md)
