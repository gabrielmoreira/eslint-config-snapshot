# AI_CHANGELOG.md

This file records iterative user requests handled with Codex and their outcomes.

## 2026-02-13 - Request 001

Author: Gabriel Moreira

Request summary:

- Validate implementation against spec, apply corrections, simplify where possible, harden tests, broaden isolated workspace scenarios, and improve README.

Result:

- Expanded validation across API and CLI.
- Improved fixture coverage including isolated pnpm/npm execution.
- Updated project documentation for current behavior.

## 2026-02-13 - Request 002

Author: Gabriel Moreira

Request summary:

- Add Cosmiconfig-based configuration discovery, improve positive/negative CLI testing, add terminal-invoked assertions, and maintain an enhancement staging spec.

Result:

- Implemented Cosmiconfig loading with supported config prefixes.
- Added robust integration and terminal tests for command variants.
- Introduced and maintained `SPEC_ENHANCED.md` as staging.

## 2026-02-13 - Request 003

Author: Gabriel Moreira

Request summary:

- Reduce package fragmentation to two packages and simplify architecture.

Result:

- Consolidated to `@eslint-config-snapshotter/api` and `@eslint-config-snapshotter/cli`.
- Removed obsolete split package structure.

## 2026-02-13 - Request 004

Author: Gabriel Moreira

Request summary:

- Improve default CLI UX: detect drift without extra command, support update flow from default invocation, and provide clearer summaries.

Result:

- Added default drift check behavior.
- Added update flow from default mode.
- Added richer summary output and improved guidance for missing config/snapshots.

## 2026-02-13 - Request 005

Author: Gabriel Moreira

Request summary:

- Adopt a modern CLI framework and simplify command model with ecosystem-friendly naming.

Result:

- Migrated CLI parsing/help to `commander`.
- Established canonical commands: `check`, `update`, `print`, `init`.
- Kept backward-compatible aliases: `snapshot`, `compare`, `status`, `what-changed`.

## 2026-02-13 - Request 006

Author: Gabriel Moreira

Request summary:

- Refine diff presentation: nested output sections and suppression of noisy option changes.

Result:

- Implemented nested list formatting for removed/severity/options sections.
- Suppressed option noise when rules are removed or severity changes.

## 2026-02-13 - Request 007

Author: Gabriel Moreira

Request summary:

- Ensure rules previously shown as option changes are represented as removed when configuration intent is effectively removed.

Result:

- Updated diff classification: `off + options` to `off` is treated as removed config intent.
- Validated through API and CLI tests.

## 2026-02-13 - Request 008

Author: Gabriel Moreira

Request summary:

- Promote staged enhancements into main spec, empty enhancement staging file, simplify README, add contributing guidance, and make AI update log mandatory in process docs.

Result:

- Merged active staged behavior into `docs/SPEC.md`.
- Reset `docs/SPEC_ENHANCED.md` to empty staging state.
- Simplified `README.md` and added `docs/CONTRIBUTING.md`.
- Updated `docs/AGENTS.md` and `docs/TASKS.md` to require changelog entries for every change request.

## 2026-02-13 - Request 009

Author: Gabriel Moreira

Request summary:

- Require committer full name in every AI changelog entry to disambiguate parallel or same-number requests.

Result:

- Added `Author` field to all existing entries.
- Updated process docs to make committer full name mandatory for all future changelog entries.

## 2026-02-13 - Request 010

Author: Gabriel Moreira

Request summary:

- Create three commits in sequence: refresh snapshot, re-enable Unicorn, then add a deprecated plugin in warn mode, scan for deprecated usage, apply simple fixes, and document complex follow-up tasks.

Key decisions:

- Used `eslint-plugin-deprecate` (ESLint 9 compatible in this repository) with `deprecate/member-expression` configured as `warn`.
- Added baseline deprecated member checks for `fs.rmdir`, `fs.rmdirSync`, `url.parse`, `util.isArray`, `util.isDate`, and `util.isRegExp`.

Result:

- Commit 1 refreshed baseline snapshot for the temporary non-Unicorn state.
- Commit 2 re-enabled Unicorn recommended config and refreshed snapshot.
- Deprecated plugin guard added and snapshot refreshed to include `deprecate/member-expression`.
- Scan found no direct deprecated member-expression matches in current source files.

Follow-up notes:

- Dynamic/aliased deprecated API usage is not reliably detectable with the current static member-expression rule; this is tracked as a future task in `docs/IMPLEMENTATION_REVIEW.md`.

## 2026-02-13 - Request 011

Author: Gabriel Moreira

Request summary:

- Investigate deprecated use of `tseslint.config`, move linting toward type-checked recommendations where possible, and evaluate/improve file sampling diversity without overengineering.

Key decisions:

- Switched root lint composition to `defineConfig(...)` and moved TypeScript baseline from `recommended` to `recommendedTypeChecked`.
- Applied typed linting primarily to `**/src/**` files, while disabling type-checked-only rules in `**/test/**` to keep stable and fast test linting.
- Kept pragmatic overrides for high-noise rules already known in this codebase.
- Implemented deterministic, lightweight diversified sampling:
  - token-based first-pass diversity
  - uniform fallback spacing over remaining sorted files

Result:

- Lint now uses type-checked recommended rules for source files.
- Sampling strategy is now more representative for large candidate sets while remaining deterministic.
- Added/updated sampling tests for distribution and hinted diversity behavior.
- Project checks pass with current policy (`build/lint/typecheck/test`).

## 2026-02-13 - Request 012

Author: Gabriel Moreira

Request summary:

- Replace pattern-based deprecated checks with TypeScript-aware deprecation detection.
- Enforce cleaner import organization (sorting, deduplication, type imports).
- Keep local project snapshotter config minimal and provide practical configuration examples.

Key decisions:

- Replaced `eslint-plugin-deprecate` with `@typescript-eslint/no-deprecated` on typed source files.
- Added import hygiene rules using `eslint-plugin-import` plus TypeScript type-import enforcement:
  - `import/order`
  - `import/no-duplicates`
  - `sort-imports` (member sorting only)
  - `@typescript-eslint/consistent-type-imports`
- Kept project config intentionally minimal (`export default {}`) and documented advanced variants in a dedicated examples document.
- Fixed a robustness gap in CLI snapshot extraction for ignored sample files where ESLint prints `undefined` instead of JSON.

Result:

- Deprecated API usage warnings now rely on type-aware TypeScript metadata (`@deprecated`) in source files.
- Import blocks across code and tests are now consistently grouped, deduplicated, and type-separated.
- Added `docs/EXAMPLES.md` with concrete configuration scenarios and rationale.
- README now references minimal config strategy and links to examples.
- Snapshot update now succeeds with minimal config in this repository.

Follow-up notes:

- Current lint baseline still keeps existing cognitive-complexity warnings in API/CLI source as warnings (no behavior change in this request).
