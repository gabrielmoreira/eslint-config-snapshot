# CONTRIBUTING.md

Thanks for contributing to ESLint Config Snapshot.

See also: [`docs/SPEC.md`](SPEC.md), [`docs/TASKS.md`](TASKS.md), [`README.md`](../README.md)

## Development Setup

Requirements:

- Node.js 20+
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

Zero-config note:

- The CLI can run without explicit config and uses built-in defaults.
- `init` is optional and mainly for explicit customization.

## Commit Rules

- Use Conventional Commits.
- Keep commits focused and reviewable.
- Do not push directly from automation agents.

## Documentation Rules

When behavior changes:

1. Update `docs/SPEC.md` if specification changed.
2. Keep `docs/SPEC_ENHANCED.md` only for temporary staged items.
3. Update `README.md` usage sections.
4. Append a new entry to `docs/AI_CHANGELOG.md`.

Documentation map:

- `README.md`: end-user usage
- `docs/SPEC.md`: technical source of truth
- `docs/EXAMPLES.md`: configuration recipes
- `docs/FINDINGS.md`: active limitations and technical findings

## How We Use Codex

We use Codex as an autonomous coding collaborator for implementation, refactors, and test expansion.

Operating model:

- Codex reads `docs/SPEC.md`, `docs/SPEC_ENHANCED.md`, `docs/AGENTS.md`, and `docs/TASKS.md`.
- Codex implements requested changes directly in the workspace.
- Codex runs validations and reports outcomes.
- Codex records request/result history in `docs/AI_CHANGELOG.md`.

Human maintainers remain the final reviewers for architecture and release decisions.

## Release Process (Changesets)

This repository uses Changesets for package versioning and release preparation.

1. Create a changeset:
   - `pnpm changeset`
2. Apply versions:
   - `pnpm release:version`
   - This also syncs the root `package.json` version to match package release version.
3. Commit version and changelog files.
4. Push changes to `main`.
5. CI validates quality gates and dispatches `publish-npm.yml` automatically only when npm/local versions drift.
6. The publish workflow publishes with Changesets and creates/pushes `vX.Y.Z` automatically.

Manual dispatch remains available (requires GitHub CLI):

- `pnpm release:run`
- optional live watch: `pnpm release:run:watch`
- non-interactive watch: `pnpm release:run:watch:ci`
- optional ref override: `pnpm release:run -- --ref main`
- optional custom run label: `pnpm release:run -- --label v0.14.1`
- default run label is inferred from root `package.json` version

GitHub CLI setup (once):

```bash
gh auth login
```

Trusted Publishing note:

- npm publication is configured to use GitHub Trusted Publishing (OIDC).
- No long-lived `NPM_TOKEN` is required for the release workflow.

## Dependency Updates

- Renovate is configured in `renovate.json`.
- Adjust scheduling, grouping, or automerge policy in that file as maintenance needs evolve.
