# FINDINGS.md

## Scope

This file tracks active technical findings only: risks, limitations, and deferred investigations.

## Open Findings

- Test infrastructure warning: isolated tests still emit shell-related `DEP0190` warnings in some environments.
- CLI output consistency can still be tuned further across `check`, `status`, and alias paths.

## Resolved Findings

- Init prompt clarity for default group `*` is now explicit in CLI and docs.
- Numbered init prompt flow was fully removed in favor of Inquirer select/checkbox prompts.
- CJS `import.meta` warning in dual-format build output is resolved.
- Runtime crash on same-severity rule option conflicts was fixed with deterministic aggregation logic.
- npm provenance release mismatch was fixed by adding proper package repository metadata.

## Deferred Findings

- Optional advanced repository scan command for deep per-project ESLint inspection (beyond current recommended v0 assist).
- Optional full-availability baseline mode for plugin rule inventory drift.
