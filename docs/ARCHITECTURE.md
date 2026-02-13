# ARCHITECTURE.md

This document explains module intent and boundaries for `@eslint-config-snapshot/api` and `@eslint-config-snapshot/cli`.

It is guidance, not rigid law. Prefer clarity and low coupling over strict formalism.

## Design Goals

- Keep snapshot behavior deterministic.
- Keep modules focused on one responsibility.
- Keep cross-package boundaries simple: API computes data, CLI renders UX.
- Avoid accidental architectural drift as features evolve.

## Package Boundaries

## `@eslint-config-snapshot/api`

Purpose:

- deterministic, reusable core logic with no CLI UX concerns.

What belongs here:

- config loading and defaults
- workspace discovery and grouping
- sampling and extraction
- snapshot encode/decode and diffing
- deterministic normalization/sorting helpers

What does not belong here:

- terminal colors, prompts, banners, friendly wording
- command parsing
- process-level CLI behavior (exit messages, interactive flows)

Current module intent:

- `src/config.ts`: config schema/defaults/scaffolds and config resolution.
- `src/workspace.ts`: workspace discovery and workspace-to-group assignment.
- `src/sampling.ts`: deterministic sampled file selection.
- `src/extract.ts`: effective ESLint config extraction for sampled files/workspaces.
- `src/snapshot.ts`: snapshot shape, canonicalization, persistence helpers.
- `src/diff.ts`: snapshot comparison and structured change output.
- `src/core.ts`: shared pure helpers (path normalization, stable ordering, etc.).
- `src/index.ts`: public package exports.

Rule of thumb:

- if logic can be reused by another host (not just this CLI), it probably belongs in API.

## `@eslint-config-snapshot/cli`

Purpose:

- user interaction, command orchestration, and presentation over API primitives.

What belongs here:

- CLI command parsing and aliases
- interactive/non-interactive flow decisions
- terminal behavior (TTY checks, prompts, color usage)
- human-readable output formatting and run summaries
- orchestration across API calls

What does not belong here:

- core snapshot algorithms
- workspace/group/sampling business rules that should be shared

Current module intent:

- `src/index.ts`: command wiring and dispatcher.
- `src/commands/check.ts`: check execution flow and output policy.
- `src/commands/update.ts`: baseline update flow.
- `src/commands/print.ts`: print/config command flows.
- `src/init.ts`: init command workflow (interactive and non-interactive).
- `src/runtime.ts`: orchestration helpers around API execution and snapshot loading/writing.
- `src/terminal.ts`: semantic terminal I/O wrapper (write/error/prompt/colors/timing).
- `src/run-context.ts`: run header/context rendering (repo/config/baseline/version summary).
- `src/formatters.ts`: pure text formatters (diffs, short output, labels, counters).

Rule of thumb:

- if code touches prompts/colors/message tone, keep it in CLI modules.
- if code is pure data transformation with no terminal dependency, keep it in `formatters` or move to API if domain-level.

## End-to-End Flow (Simplified)

Default run (`eslint-config-snapshot`):

1. CLI parses args and resolves command mode.
2. CLI loads config/baseline context and prints run header.
3. CLI asks API runtime to compute current snapshots.
4. CLI compares current snapshots against stored baseline (API diff model).
5. CLI renders summary/diff/status and exit code.

Update run (`eslint-config-snapshot --update` or `update`):

1. CLI resolves workspaces/groups using current config.
2. API computes current snapshot state.
3. CLI writes baseline files via API helpers.
4. CLI prints deterministic summary.

## Evolution Guidelines

When adding logic:

- Prefer extending an existing module if responsibility is the same.
- Create a new file only when one of these is true:
  - a module is accumulating mixed responsibilities,
  - behavior needs independent unit tests,
  - coupling can be clearly reduced.

When in doubt:

- keep `index.ts` thin,
- keep API deterministic/pure,
- keep CLI human-facing/orchestration-focused.

## Non-Goals

- Perfectly strict layering for every helper.
- Micro-file decomposition.
- Premature abstractions for one-off behaviors.

The project optimizes for maintainability and readability, not architectural ceremony.
