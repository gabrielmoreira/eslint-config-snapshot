# AGENTS.md

## Authoritative Documents

This repository has four mandatory authoritative documents:

1. `SPEC.md`
2. `SPEC_ENHANCED.md`
3. `AGENTS.md`
4. `TASKS.md`

Read and apply them in this exact order.

Priority rules:

- Active items in `SPEC_ENHANCED.md` extend `SPEC.md`.
- `SPEC.md` overrides `AGENTS.md` and `TASKS.md`.
- `AGENTS.md` overrides `TASKS.md`.

## Implementation Constraints

- Use TypeScript for all source code.
- Use Vitest for tests.
- Use ESLint for linting.
- Use pnpm + Nx targets for `build`, `lint`, `typecheck`, `test`.
- Keep snapshots deterministic and free of volatile metadata.
- Resolve ESLint per workspace.
- Ensure cross-platform behavior (Windows, macOS, Linux).

## Mandatory Workflow

Before implementation, read all four authoritative documents.

For every substantial implementation step:

- run impacted checks (`build`, `lint`, `typecheck`, `test`)
- keep changes small and deterministic
- commit locally using Conventional Commits
- do not push

## Collaboration Rhythm

- Keep changes in small milestones that can be validated independently.
- Keep user-facing CLI output intentional, readable, and psychologically appropriate to the scenario.
- Prefer one clear path over multiple redundant command patterns.
- When behavior changes, update docs in the same iteration.

## Documentation Maintenance Rules

For every request that changes behavior, UX, or process:

1. Append an entry to `docs/ai-updates/AI_CHANGELOG.md`.
2. Update task status in `docs/TASKS.md`:
- mark completed items
- add new actionable items when discovered
3. Update `docs/IMPLEMENTATION_REVIEW.md`:
- keep only non-shipped limitations and active follow-ups
- move shipped items out of pending sections

`docs/IMPLEMENTATION_REVIEW.md` must stay as a live status board, not a historical dump.

## Dependency Discipline

- Prefer minimal dependencies.
- Any newly introduced dependency must be documented in `docs/DEPENDENCIES.md` with justification.

## AI Iteration Log (Mandatory)

For every user request that results in code/docs/process changes, the agent MUST append an entry to:

- `docs/ai-updates/AI_CHANGELOG.md`

Each entry must be in English and include:

- user request summary (agent interpretation)
- key decisions
- implementation result
- relevant follow-up notes or limitations
- author (committer full name used in this repository)

This requirement is mandatory and continuous for all future requests.

## Conventional Commits + Hooks

- `commit-msg` validates Conventional Commits via commitlint
- `pre-commit` runs ESLint on staged files (lint-staged)
- `pre-push` runs Nx affected tests via Node scripts

Hook logic must remain cross-platform.
