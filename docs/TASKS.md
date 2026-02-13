# TASKS.md

## Scope

`TASKS.md` is the actionable execution board.

Specification authority remains:

- `SPEC.md`
- `SPEC_ENHANCED.md` (only when it has active staged items)
- `AGENTS.md`

If any conflict exists, follow priority from `docs/AGENTS.md`.

## Active Tasks

- [ ] Reduce CLI noise by auditing message consistency across `check`, `compare`, and `status`.
- [ ] Revisit isolated test process spawning to reduce shell-related warnings.

## Backlog (Exploration)

- [ ] Add advanced config-suggestion command with deep per-project ESLint inspection (current recommended flow already provides a partial v0 workspace grouping assist).
- [ ] Add optional full-availability baseline mode that tracks available plugin rules (not only configured runtime state).
- [ ] Evaluate replacing current prompt logic with a lightweight selection UI library if complexity grows.

## Recently Completed

- [x] Clarify `init` default-group (`*`) meaning in CLI prompts and docs.
- [x] Migrate init interactive flow to Inquirer select/checkbox prompts.
- [x] Add effective evaluated config command (`config`).
- [x] Fix deterministic handling of same-severity rule option conflicts during aggregation.
- [x] Improve default `check` summary output with clearer section headers and aligned counters.
- [x] Add output glossary to README for summary counter interpretation.
- [x] Optimize workspace extraction flow to avoid repeated ESLint process startup per sampled file when ESLint API is available.

## Quality Gates

For completed work, ensure:

- `pnpm nx run-many -t build`
- `pnpm nx run-many -t lint`
- `pnpm nx run-many -t typecheck`
- `pnpm nx run-many -t test`

## Mandatory Documentation Updates

For every user request that changes code, behavior, or project process:

1. Append an English entry to `docs/AI_CHANGELOG.md`.
2. Include the committer full name in the changelog entry (`Author` field).
3. Update affected specification or usage docs if behavior changed.
4. Keep `SPEC_ENHANCED.md` reserved for staged-only changes.
5. Update this task board with completion status changes.
6. Keep `docs/FINDINGS.md` focused on current limitations and active follow-ups.

## Completion Rule

Completion means satisfying the active specification contract and updating mandatory documentation, not only finishing code edits.
