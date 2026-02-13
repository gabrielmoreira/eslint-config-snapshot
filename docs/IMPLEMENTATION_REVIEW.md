# Implementation Review

## Scope

This file is a live implementation status board.

## Current Feature Status

### Shipped

- [x] Config discovery via `cosmiconfig` with supported prefixes and package.json field.
- [x] Two-package architecture (`@eslint-config-snapshot/api`, `@eslint-config-snapshot/cli`).
- [x] Workspace-scoped ESLint resolution and extraction.
- [x] Deterministic snapshot format and stable ordering.
- [x] Grouping modes (`match`, `standalone`) with ordered matching and negative patterns.
- [x] Terminal-invoked CLI integration tests and isolated package-manager coverage (pnpm and npm).
- [x] Default command behavior with baseline creation flow and `--update` baseline refresh.

### In Progress

- [ ] Ongoing UX tuning for summary wording and low-noise guidance output.

### Remaining Practical Work

- [ ] Resolve CJS build warning around `import.meta` in dual-format output.
- [ ] Add explicit invalid-input retry coverage for interactive numbered `init` prompts.
- [ ] Review and reduce shell-related warnings in isolated process tests when feasible.

## Fast Follow Opportunities

- [ ] Add concise command examples to README for `check`, `--update`, and `init --force`.
- [ ] Add one short "output glossary" section describing summary counters.

## Exploration Ideas

- [ ] Optional repository scan command for generating suggested config from detected workspace/layout patterns.
- [ ] Optional full-availability baseline mode for installed plugin rule inventory drift.

## Agent Tasklist

- [ ] Keep this board updated by removing shipped items from pending sections.
- [ ] Ensure each unresolved issue listed here has either:
- a concrete next action in `docs/TASKS.md`, or
- a rationale for deferring.
- [ ] Avoid duplicating historical notes already captured in `docs/ai-updates/AI_CHANGELOG.md`.
