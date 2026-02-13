# AGENTS.md

## Authoritative Documents

This repository contains three mandatory authoritative documents:

SPEC.md  
AGENTS.md  
TASKS.md  

These three files define the complete contract and implementation plan.

The agent MUST read and follow them in this exact order:

1. SPEC.md — defines the complete technical specification (source of truth)
2. AGENTS.md — defines execution rules and constraints for the agent
3. TASKS.md — defines the execution plan and required implementation steps

SPEC.md has absolute priority.

If any conflict exists:

SPEC.md overrides AGENTS.md and TASKS.md  
AGENTS.md overrides TASKS.md  

The agent MUST NOT invent behavior not defined in SPEC.md.

The agent MUST fully implement SPEC.md.

## ESLint Config Snapshotter Agent Instructions

You are an autonomous coding agent operating inside this repository.

Your goal is to implement the tool described in SPEC.md as a TypeScript monorepo using pnpm + Nx.

Non-negotiables:
- All code is TypeScript.
- Tests use Vitest.
- Lint uses ESLint.
- Snapshots are JSON, pretty printed (indent 2), compact ESLint-style rule entries.
- Snapshot files MUST NOT include sampled file paths, hashes, timestamps, versions, env info, or absolute paths.
- Grouping uses ordered match groups with glob patterns and negative patterns ('!'), first match wins.
- Workspace input supports 'discover' (default) and 'manual' (skip discovery).
- ESLint resolution MUST be workspace-scoped: resolve eslint relative to each workspace and run:
  node <resolved-eslint-bin> --print-config <fileAbs> with cwd=workspaceAbs
- Must support Node 18+, macOS/Linux/Windows path normalization.
- Repo uses pnpm + Nx. Use Nx targets for build/test/lint/typecheck.

Definition of Done:
- Required CLI commands implemented: snapshot, compare, status, print, init.
- CLI works end-to-end on fixtures.
- All tests pass via Nx: `pnpm nx run-many -t test`.
- Lint passes via Nx: `pnpm nx run-many -t lint`.
- Build passes via Nx: `pnpm nx run-many -t build`.
- Typecheck passes: `pnpm nx run-many -t typecheck`.
- Snapshot format exactly matches SPEC.md (compact, pretty, deterministic).

Work approach:
- Work in small steps.
- After each step, run: build + lint + test for impacted projects.
- Add integration fixtures with two workspaces using different ESLint versions.
- Prefer minimal dependencies. Use @manypkg/get-packages for discovery. Use a widely adopted glob library.
- Do not store volatile data in snapshots.
- Add docs/DEPENDENCIES.md if any new dependency is introduced, with justification.
- You MUST create local git commits after each major milestone using Conventional Commits.
- You MUST NOT push commits.

Mandatory reading requirement:

Before writing any code, the agent MUST read completely:

SPEC.md
AGENTS.md
TASKS.md

The agent MUST NOT begin implementation until all three are fully read.

Conventional Commits + Hooks:
- commit-msg must validate Conventional Commits via commitlint
- pre-commit must run ESLint on staged files (lint-staged)
- pre-push must run Nx affected tests (only affected)

Implement hooks in a cross-platform way by calling Node scripts from husky hooks (no bash-only logic).
