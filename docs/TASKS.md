# TASKS.md

## Execution Contract

`TASKS.md` defines execution order and required deliverables.

The implementation contract is defined by:

- `SPEC.md`
- `SPEC_ENHANCED.md` (only when it has active staged items)
- `AGENTS.md`

If any conflict exists, follow document priority from `AGENTS.md`.

## Required Workstream

1. Keep monorepo architecture aligned with `SPEC.md`.
2. Implement and maintain `@eslint-config-snapshotter/api`.
3. Implement and maintain `@eslint-config-snapshotter/cli`.
4. Keep hooks and commit standards operational.
5. Keep docs aligned with shipped behavior.

## Quality Gates

For completed work, ensure:

- `pnpm nx run-many -t build`
- `pnpm nx run-many -t lint`
- `pnpm nx run-many -t typecheck`
- `pnpm nx run-many -t test`

## Mandatory Documentation Updates

For every user request that changes code, behavior, or project process:

1. Append an English entry to `docs/ai-updates/AI_CHANGELOG.md`.
2. Include the committer full name in the changelog entry (`Author` field).
3. Update affected specification or usage docs if behavior changed.
4. Keep `SPEC_ENHANCED.md` reserved for staged-only changes.

## Completion Rule

Completion means satisfying the active specification contract and updating mandatory documentation, not only finishing code edits.
