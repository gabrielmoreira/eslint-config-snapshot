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

- [x] Add dedicated OSS compatibility workflow to validate zero-config behavior against complex external repositories (starting with next.js).
- [x] Add GitHub coverage visualization upgrades (Codecov upload, HTML coverage artifacts, and job summary table).
- [x] Add CI npm-drift detection that dispatches publish workflow automatically instead of embedding publish logic in CI.
- [x] Add dynamic publish workflow run naming with version/ref label and serialize runs via workflow concurrency.
- [x] Add non-interactive release watch command that resolves run ID and watches `gh run` without prompt.
- [x] Add CLI-based release workflow trigger scripts (`release:run`, `release:run:watch`) using GitHub CLI dispatch.
- [x] Refactor release flow to manual GitHub dispatch publishing with automatic tag creation in workflow (no manual local tagging).
- [x] Expand `.gitignore` to cover generated test report artifacts (`**/test-results/`, `*.junit.xml`, `.vitest/`).
- [x] Fix CI reports workflow by building before coverage tests and hardening test-reporter permissions/behavior for forked PR contexts.
- [x] Add GitHub CI report job with JUnit test publishing, coverage summary, and report artifacts upload.
- [x] Align isolated npm/pnpm integration test expectations with multi-variant rule snapshot encoding.
- [x] Add architecture guidance documenting API/CLI file responsibilities and practical module boundaries.
- [x] Extend default sampling globs to include `json` and `css` while preserving `md/mdx`.
- [x] Prioritize code-like files (`ts/tsx/js/jsx/cjs/mjs`) in sampling selection before non-code candidates.
- [x] Include `md` and `mdx` in default sampling globs and cover it with a dedicated config test.
- [x] Rename CLI presentation module to `run-context` for clearer responsibility naming.
- [x] Centralize CLI color behavior in terminal abstraction and keep output-format module color-agnostic.
- [x] Enforce deterministic rule-variant sorting by canonical JSON lexical order (not insertion order).
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
