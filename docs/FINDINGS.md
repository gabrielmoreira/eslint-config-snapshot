# FINDINGS.md

## Scope

This file tracks active technical findings only: risks, limitations, and deferred investigations.

## Open Findings

- `build` warning: CJS output still reports `import.meta` warning from bundling flow.
- Test infrastructure warning: isolated tests still emit shell-related `DEP0190` warnings in some environments.
- CLI output consistency can still be tuned further across `check`, `status`, and alias paths.

## Resolved Findings

- Init prompt clarity for default group `*` is now explicit in CLI and docs.
- Numbered init prompt flow was fully removed in favor of Inquirer select/checkbox prompts.
- Runtime crash on same-severity rule option conflicts was fixed with deterministic aggregation logic.
- npm provenance release mismatch was fixed by adding proper package repository metadata.

## Deferred Findings

- Optional repository scan command for generating suggested config based on detected layout.
- Optional full-availability baseline mode for plugin rule inventory drift.
