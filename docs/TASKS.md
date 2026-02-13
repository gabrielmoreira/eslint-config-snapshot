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
- [ ] Add coverage threshold enforcement for both packages in CI.

## Backlog (Exploration)

- [ ] Add advanced config-suggestion command with deep per-project ESLint inspection (current recommended flow already provides a partial v0 workspace grouping assist).
- [ ] Add optional full-availability baseline mode that tracks available plugin rules (not only configured runtime state).
- [ ] Evaluate replacing current prompt logic with a lightweight selection UI library if complexity grows.

## Recently Completed

- [x] Introduce semantic `TerminalIO` abstraction for CLI I/O, TTY capability checks, prompts, and paused timing behavior.
- [x] Restructure CLI command execution into dedicated command modules and keep `index.ts` focused on parser/dispatcher wiring.
- [x] Preserve multiple observed `severity+options` rule combinations in snapshot output with deterministic variant ordering.
- [x] Split additional CLI responsibilities into dedicated `init` and `ui` modules to reduce `index.ts` orchestration overload.
- [x] Split CLI internals into `output` and `runtime` modules with dedicated unit tests while keeping command behavior stable.
- [x] Clarify `init` default-group (`*`) meaning in CLI prompts and docs.
- [x] Migrate init interactive flow to Inquirer select/checkbox prompts.
- [x] Add effective evaluated config command (`config`).
- [x] Fix deterministic handling of same-severity rule option conflicts during aggregation.
- [x] Improve default `check` summary output with clearer section headers and aligned counters.
- [x] Add output glossary to README for summary counter interpretation.
- [x] Optimize workspace extraction flow to avoid repeated ESLint process startup per sampled file when ESLint API is available.
- [x] Add CI matrix for Node 20.x, 22.x, and latest with CLI smoke step.
- [x] Remove `shell: true` spawn usage in isolated integration tests to eliminate `DEP0190` warnings.
- [x] Add Renovate configuration for dependency update automation.
- [x] Add command timing logs with interactive prompt wait-time excluded.

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
