# TASKS.md

## Execution Contract

`TASKS.md` defines execution order and required deliverables.

The implementation contract is defined by:

- `SPEC.md`
- `SPEC_ENHANCED.md` (only when it has active staged items)
- `AGENTS.md`

If any conflict exists, follow document priority from `AGENTS.md`.

## Delivery Status

### Core Workstream

- [x] Keep monorepo architecture aligned with `SPEC.md`.
- [x] Implement and maintain `@eslint-config-snapshot/api`.
- [x] Implement and maintain `@eslint-config-snapshot/cli`.
- [x] Keep hooks and commit standards operational.
- [x] Keep docs aligned with shipped behavior.

### Active Short-Cycle Tasks

- [ ] Decide and implement final wording for clean/drift/status summaries after latest UX iterations.
- [ ] Commit pending CLI UX changes and related tests.
- [ ] Run full repo quality gates (`build`, `lint`, `typecheck`, `test`) after pending commit.

### Quick Wins (Practical Near-Term)

- [x] Improve `init --help` examples with numbered prompt usage and `--force` guidance.
- [ ] Add one terminal integration case for invalid numbered init input followed by valid retry.
- [ ] Reduce CLI noise by auditing message consistency across `check`, `compare`, and `status`.

### Exploration Backlog (Future Ideas)

- [ ] Add optional config-suggestion command that scans project structure and proposes starter config.
- [ ] Add optional full-availability baseline mode that tracks available plugin rules (not only configured runtime state).
- [ ] Evaluate replacing current prompt logic with a lightweight selection UI library if complexity grows.

### Agent Follow-Up List

- [ ] Resolve CJS `import.meta` build warning in dual-format CLI output.
- [ ] Revisit isolated test process spawning to avoid dependency on shell behavior warnings.
- [ ] Keep this list current whenever a limitation is discovered and not solved in the same iteration.

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
6. Keep `docs/IMPLEMENTATION_REVIEW.md` focused on current limitations and active follow-ups.

## Completion Rule

Completion means satisfying the active specification contract and updating mandatory documentation, not only finishing code edits.
