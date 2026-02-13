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

- Consolidated to `@eslint-config-snapshot/api` and `@eslint-config-snapshot/cli`.
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
- Keep local project snapshot config minimal and provide practical configuration examples.

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

## 2026-02-13 - Request 013

Author: Gabriel Moreira

Request summary:

- Rewrite README for end users (not repository developers), with modern positioning, simple setup flow, and package-manager execution via `npx`/`pnpm dlx`.
- Add npm badges in the main README.
- Keep advanced configuration details out of the main README.
- Improve `init` UX so first-time users can choose config target (`package.json` vs file) and preset (`minimal` vs `full`) without excessive CLI complexity.

Key decisions:

- Rewrote README around user value (lint drift detection) and minimal onboarding path.
- Added npm badges for package version and monthly downloads.
- Kept main README focused on:
  - why the tool exists
  - `init` -> `--update` -> `check` flow
  - no-install execution (`pnpm dlx` / `npx`)
- Kept advanced configuration examples in `docs/EXAMPLES.md`.
- Implemented `init` options:
  - `--target <file|package-json>`
  - `--preset <minimal|full>`
  - `--yes` for non-interactive usage
- Added a short interactive setup assistant for TTY sessions when options are omitted.
- Default non-interactive behavior remains deterministic and simple.

Result:

- End-user README now presents a modern, concise, high-signal UX.
- `init` can now create config either as:
  - `eslint-config-snapshot.config.mjs`
  - `package.json` field `eslint-config-snapshot`
- Added/updated CLI tests for:
  - `init --target file --preset full`
  - `init --target package-json --preset minimal`
- Full CLI tests and lint/typecheck checks pass after the update.

## 2026-02-13 - Request 014

Author: Gabriel Moreira

Request summary:

- Rename the product identity from `eslint-config-snapshotter` to `eslint-config-snapshot` everywhere.
- Rename snapshot directory from `.eslint-config-snapshots` to `.eslint-config-snapshot`.
- Rename config filename to `eslint-config-snapshot.config.mjs` and config key to `eslint-config-snapshot`.
- Prefer local minimal initialization in `package.json` for this repository instead of a dedicated config file.
- When running the CLI with no command/options and no local initialization:
  - in interactive terminals, suggest and guide `init`;
  - in non-interactive contexts, fail with clear initialization guidance.

Key decisions:

- Applied full naming migration across:
  - package names (`@eslint-config-snapshot/api`, `@eslint-config-snapshot/cli`)
  - CLI binary name (`eslint-config-snapshot`)
  - Cosmiconfig namespace and supported filenames/prefixes
  - docs, specs, tests, fixtures, and output strings
- Migrated default snapshot output directory to `.eslint-config-snapshot/`.
- Updated this repository root configuration strategy:
  - removed local config file from root
  - added minimal `eslint-config-snapshot: {}` to root `package.json`
- Implemented default-command onboarding behavior:
  - if config is missing and terminal is interactive, prompt to run init and optionally create first baseline
  - if not interactive, return error with explicit init/update instructions

Result:

- Naming is now consistent with `eslint-config-snapshot` across code and documentation.
- Default snapshot baseline path is now `.eslint-config-snapshot/default.json`.
- CLI default UX is improved for first run without adding command sprawl.
- Integration and terminal tests were updated and continue to pass with the renamed identity.

## 2026-02-13 - Request 015

Author: Gabriel Moreira

Request summary:

- Remove the practical need for `init` in normal usage.
- If no config exists, use minimal defaults automatically and show only a low-noise tip about optional init.
- If no baseline snapshot exists:
  - in interactive mode, ask whether current execution should become baseline;
  - otherwise fail with clear `--update` guidance.
- Always remind users about `--update` when running check flows without updating.
- Keep `init` as an advanced customization path and update README accordingly.
- Improve markdown cross-linking and document a future idea for config suggestion via repository scan.

Key decisions:

- Kept `init` command available, but removed config as a hard requirement for `check` and `update`.
- Added default check behavior:
  - uses built-in defaults when no explicit config is present
  - prints a single optional-init tip
- Added interactive baseline creation prompt for first run when no snapshot baseline exists.
- Added persistent baseline refresh hint (`eslint-config-snapshot --update`) in check/status/summary outputs.
- Added graceful fallback message when automatic workspace discovery fails under default config.
- Updated README quick start to use baseline/update flow without requiring init.

Result:

- First-run UX is simpler for typical users and still supports advanced explicit config.
- Baseline lifecycle is clearer through consistent update reminders.
- Documentation now presents init as optional and links docs with markdown references.
- Added future TODO in implementation review for optional config suggestion via repository scan.

## 2026-02-13 - Request 016

Author: Gabriel Moreira

Request summary:

- Clarify in README that current scope snapshots only the effective configured runtime, not the full universe of possible plugin rules.
- Recommend ESLint inspector tooling for complete rule exploration.
- Track a future enhancement for full plugin-rule inventory and separate baseline comparison.

Key decisions:

- Added explicit scope boundary section in README.
- Documented that full plugin rule discovery is out of current scope and pointed users to ESLint inspector workflows.
- Expanded implementation TODOs with a concrete "full availability baseline" proposal.

Result:

- User-facing docs now prevent scope confusion about what drift detection includes today.
- Future direction is documented for separate full baseline support that could surface newly available rules after upgrades.

## 2026-02-13 - Request 017

Author: Gabriel Moreira

Request summary:

- Audit all existing documentation, remove outdated content, fix inaccuracies, and add missing sections where needed.

Key decisions:

- Updated `README.md` to align with current zero-config baseline workflow:
  - added explicit first-run behavior
  - added troubleshooting section
  - expanded documentation links
- Updated `docs/SPEC.md` to reflect shipped CLI behavior:
  - zero-config fallback
  - interactive/non-interactive first-baseline behavior
  - baseline update reminder policy
  - explicit scope-boundary section
- Updated `docs/EXAMPLES.md` to prioritize package.json minimal config and clarify file-based minimal as an alternative.
- Updated `docs/CONTRIBUTING.md` with zero-config note and a concise documentation map.

Result:

- Documentation set is now consistent with current runtime behavior and naming.
- Reader navigation is improved through additional cross-links and clearer sectioning.
- Core specification and user-facing docs now describe the same baseline lifecycle and initialization model.

## 2026-02-13 - Request 018

Author: Gabriel Moreira

Request summary:

- Improve first-run UX so the CLI prints a concise summary of detected rule state before asking whether to create the initial baseline.

Key decisions:

- Added a `Current state` line (groups, total rules, severity counts) in no-baseline check flow before prompt/error handling.
- Kept the existing interactive baseline question and non-interactive `--update` guidance unchanged.
- Updated terminal output assertions to reflect the new summary line.

Result:

- First-run output now provides immediate context on what was detected before baseline confirmation.
- CLI tests remain green after output contract updates.

## 2026-02-13 - Request 019

Author: Gabriel Moreira

Request summary:

- Keep console tip styling consistent by using the same subtle visual treatment for all `Tip:` lines.
- Restrict baseline refresh reminder tip visibility to only two situations:
  - when a new baseline is created
  - when drift is detected

Key decisions:

- Reused the same subtle output path for update reminder tips (`dim` style when terminal supports it).
- Removed update reminder tip from clean/no-change paths (`check` clean, `status clean`, `compare` clean).
- Kept update reminder visible for drift and baseline-creation flows only.

Result:

- Tip styling is now consistent and low-noise.
- Update reminder appears only in high-signal moments.
- CLI output assertions were updated and tests pass.

## 2026-02-13 - Request 020

Author: Gabriel Moreira

Request summary:

- Make the clean drift message more psychologically positive and keep console wording supportive for developers.

Key decisions:

- Reframed clean compare output from neutral to positive:
  - `Great news: no snapshot changes detected.`
- Improved first-baseline copy to be encouraging while keeping actionable guidance:
  - `Current rule state: ...`
  - `You are almost set: no baseline snapshot found yet.`
  - prompt changed to `No baseline yet. Use current rule state as your baseline now? [Y/n]`
- Kept machine-friendly `status` command output unchanged (`clean` / `changes`) to preserve script compatibility.

Result:

- Console messaging is more positive in the primary human-facing flows.
- Behavioral semantics and exit codes remain unchanged.
- CLI terminal tests were updated to reflect the revised wording.
