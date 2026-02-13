# CONTRIBUTING.md

Thanks for contributing to ESLint Config Snapshot.

## Development Setup

Requirements:

- Node.js 18+
- pnpm

Install:

```bash
pnpm install
```

## Local Commands

```bash
pnpm nx run-many -t build
pnpm nx run-many -t lint
pnpm nx run-many -t typecheck
pnpm nx run-many -t test
```

CLI from source:

```bash
pnpm cli:dev -- --help
pnpm cli:dev -- check
pnpm cli:dev -- update
```

## Commit Rules

- Use Conventional Commits.
- Keep commits focused and reviewable.
- Do not push directly from automation agents.

## Documentation Rules

When behavior changes:

1. Update `docs/SPEC.md` if specification changed.
2. Keep `docs/SPEC_ENHANCED.md` only for temporary staged items.
3. Update `README.md` usage sections.
4. Append a new entry to `docs/ai-updates/AI_CHANGELOG.md`.

## How We Use Codex

We use Codex as an autonomous coding collaborator for implementation, refactors, and test expansion.

Operating model:

- Codex reads `docs/SPEC.md`, `docs/SPEC_ENHANCED.md`, `docs/AGENTS.md`, and `docs/TASKS.md`.
- Codex implements requested changes directly in the workspace.
- Codex runs validations and reports outcomes.
- Codex records request/result history in `docs/ai-updates/AI_CHANGELOG.md`.

Human maintainers remain the final reviewers for architecture and release decisions.
