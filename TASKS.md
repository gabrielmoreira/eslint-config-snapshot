# TASKS.md

## Execution Authority and Specification Contract

This file (TASKS.md) defines the execution plan.

The agent MUST follow the specifications defined in SPEC.md and SPEC_ENHANCED.md.

SPEC.md defines the base specification.
SPEC_ENHANCED.md defines mandatory staged enhancements and explicit deviations.

AGENTS.md defines execution constraints and operational rules.

TASKS.md defines implementation order only.

The agent MUST:

- implement all requirements from SPEC.md and SPEC_ENHANCED.md
- use TASKS.md only as execution order
- never contradict SPEC.md or SPEC_ENHANCED.md
- never skip requirements defined in SPEC.md or SPEC_ENHANCED.md

## Execution Plan

0) Bootstrap Nx monorepo (pnpm)
- Setup packages/* workspace layout
- Setup shared TS config
- Setup ESLint config
- Setup Vitest per package
- Nx targets: build, typecheck, lint, test
- Each package MUST have project.json defining Nx targets:
  build, typecheck, lint, test

1) packages/api
- include internal modules for core/config/workspace/sampling/extract/snapshot/diff
- export public API surface including discoverWorkspaces, normalizePath, sortUnique, assignGroupsByMatch, resolveEslintBinForWorkspace

2) packages/cli
- commands: snapshot/compare/status/print/init
- integration tests with fixtures
- terminal-invoked command tests with output assertions

3) Hooks + conventional commits
- husky + commitlint + lint-staged
- pre-push uses Nx affected test via Node script

4) Root configuration
- nx.json
- tsconfig.base.json
- workspace package.json with workspaces field

Implementation completeness requirement:

The agent MUST implement ALL requirements from SPEC.md and SPEC_ENHANCED.md.

Completion is defined by satisfying the active specification contract, not merely finishing TASKS.md.
