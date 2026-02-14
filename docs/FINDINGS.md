# FINDINGS.md

## Scope

This file tracks active technical findings only: risks, limitations, and deferred investigations.

## Open Findings

- CLI output consistency can still be tuned further across `check`, `status`, and alias paths.

## Resolved Findings

- OSS compatibility init-equivalence failures caused by non-JSON prefix lines in zero-config `print/catalog` capture were fixed by normalizing captured JSON in workflow steps.
- Command-flow duplication across CLI commands was reduced by introducing a shared snapshot-preparation executor used by `check`, `update`, `print`, and `config`.
- Init prompt clarity for default group `*` is now explicit in CLI and docs.
- Numbered init prompt flow was fully removed in favor of Inquirer select/checkbox prompts.
- CJS `import.meta` warning in dual-format build output is resolved.
- Runtime crash on same-severity rule option conflicts was fixed with deterministic aggregation logic.
- npm provenance release mismatch was fixed by adding proper package repository metadata.
- Shell-related isolated-test `DEP0190` warnings were removed by avoiding `shell: true` spawns.

## Deferred Findings

- Optional advanced repository scan command for deep per-project ESLint inspection (beyond current recommended v0 assist).
- Optional full-availability baseline mode for plugin rule inventory drift.
