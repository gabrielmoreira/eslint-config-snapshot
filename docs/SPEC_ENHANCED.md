# SPEC_ENHANCED.md

## Purpose

This document is a required staging layer that must always be used together with `SPEC.md`.

It records only explicitly requested approved deviations or enhancements.

## Active Enhancements

### E-001: Cosmiconfig-Based Configuration Discovery

Configuration discovery must use `cosmiconfig` with deterministic ordered `searchPlaces`.

The required ordered list is:

1. `.eslint-config-snapshotter.js`
2. `.eslint-config-snapshotter.cjs`
3. `.eslint-config-snapshotter.mjs`
4. `eslint-config-snapshotter.config.js`
5. `eslint-config-snapshotter.config.cjs`
6. `eslint-config-snapshotter.config.mjs`
7. `package.json`
8. `.eslint-config-snapshotterrc`
9. `.eslint-config-snapshotterrc.json`
10. `.eslint-config-snapshotterrc.yaml`
11. `.eslint-config-snapshotterrc.yml`
12. `.eslint-config-snapshotterrc.js`
13. `.eslint-config-snapshotterrc.cjs`
14. `.eslint-config-snapshotterrc.mjs`

For `package.json`, use the `eslint-config-snapshotter` field.

### E-002: Two-Package Monorepo Layout

The monorepo is intentionally collapsed to two publishable packages:

1. `@eslint-config-snapshotter/api`
2. `@eslint-config-snapshotter/cli`

All previously split internal concerns (`core`, `config`, `workspace`, `sampling`, `extract`, `snapshot`, `diff`) must live as internal modules inside `@eslint-config-snapshotter/api`.

`@eslint-config-snapshotter/cli` must consume those capabilities from `@eslint-config-snapshotter/api`.

### E-003: Modern CLI Contract and Command Model

CLI command parsing and help generation must use `commander` to avoid duplicated hardcoded help text and to keep command metadata centralized.

Canonical command model:

1. default invocation (no command): `check` with human summary output
2. `check`: compare current state against local snapshots
3. `update`: compute and write snapshots
4. `print`: inspect aggregated rules
5. `init`: create starter config

Option model:

1. `-u, --update`: update snapshots from default invocation (Jest-style snapshot update flow)
2. `check --format <summary|status|diff>`
3. `print --format <json|short>` with `--short` as compatibility shorthand

Backward-compatibility aliases must remain supported:

1. `snapshot` => `update`
2. `compare` => `check --format diff`
3. `status` => `check --format status`
4. `what-changed` => `check --format summary`

Help output should prioritize canonical commands and may hide legacy aliases from default help listing.
