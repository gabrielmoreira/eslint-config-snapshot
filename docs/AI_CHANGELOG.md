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

## 2026-02-13 - Request 021

Author: Gabriel Moreira

Request summary:

- Avoid making severity counters look like runtime errors in clean summaries while keeping the counts visible.

Key decisions:

- Replaced textual severity labels in summary lines with a compact neutral format:
  - `levels E/W/O: <error>/<warn>/<off>`
- Applied the format consistently to:
  - first-run state summary
  - clean baseline status summary
  - drift summary counts line

Result:

- Severity counters remain available and readable.
- Summary output now feels more neutral and less error-like.
- CLI tests were updated to match the new output contract.

## 2026-02-13 - Request 022

Author: Gabriel Moreira

Request summary:

- Replace the `E/W/O` shorthand with a human-readable summary that still avoids looking like an execution failure.

Key decisions:

- Replaced shorthand severity counters with explicit wording:
  - `severity mix: <errors> errors, <warnings> warnings, <off> off`
- Applied consistently to all summary surfaces that present aggregated rule counts.

Result:

- Summaries are now easier to read for humans.
- Severity context remains explicit without cryptic abbreviations.
- CLI terminal assertions were updated accordingly.

## 2026-02-13 - Request 023

Author: Gabriel Moreira

Request summary:

- Improve `init` interaction so users do not need precise free-text typing, preferably using a selector-like numeric flow.

Key decisions:

- Reworked interactive `init` prompts to numbered choices:
  - target: `1) package-json`, `2) file`
  - preset: `1) minimal`, `2) full`
- Added validation loops with clear retry messages when input is invalid.
- Kept compatibility with text aliases (`package`, `pkg`, `file`, `minimal`, `min`, `full`) and default Enter behavior.

Result:

- `init` is easier to use and less typo-prone.
- Numeric flow provides predictable UX without introducing heavy prompt dependencies.
- Added parser coverage tests for positive and negative inputs.

## 2026-02-13 - Request 024

Author: Gabriel Moreira

Request summary:

- Make `init` fail immediately when any existing config is detected, unless `--force` is explicitly provided, to avoid conflicting config locations.

Key decisions:

- Added an early preflight check in `init` using `findConfigPath`.
- New behavior:
  - if config exists and `--force` is not passed: exit with an explicit conflict message and guidance
  - if `--force` is passed: proceed
- Added `-f, --force` option to `init`.
- Kept target-specific overwrite protection, but allowed overwrite when `--force` is set.

Result:

- `init` is now safe-by-default and avoids accidental multi-source config conflicts.
- Advanced users can intentionally bypass the guard with `--force`.
- CLI terminal coverage now includes blocked and forced paths.

## 2026-02-13 - Request 025

Author: Gabriel Moreira

Request summary:

- Improve `AGENTS.md` and `TASKS.md` to better reflect the current collaboration style.
- Rework implementation review into a status-oriented checklist.
- Separate short-term actionable items from future exploration ideas.
- Maintain an explicit agent follow-up list for unresolved or deferred work.

Key decisions:

- Expanded `docs/AGENTS.md` with collaboration rhythm and documentation maintenance rules.
- Reworked `docs/TASKS.md` into a structured checklist board:
  - core shipped workstream
  - active short-cycle tasks
  - quick wins
  - exploration backlog
  - agent follow-up list
- Replaced narrative-heavy `docs/IMPLEMENTATION_REVIEW.md` with a live status board:
  - shipped
  - in progress
  - remaining practical work
  - fast follow opportunities
  - exploration ideas
  - agent tasklist

Result:

- Project process docs now provide faster status scanning and clearer next actions.
- Long-term ideas are separated from immediate executable tasks.
- Agent responsibilities for unresolved items are now explicit and continuously trackable.

## 2026-02-13 - Request 026

Author: Gabriel Moreira

Request summary:

- Improve `init --help` with practical examples, including numbered prompt usage and `--force` guidance, then commit.

Key decisions:

- Added explicit examples to `init` command help text:
  - interactive numbered prompt flow
  - non-interactive package.json minimal setup
  - forced run when existing config is detected
- Added terminal test coverage for `init --help` output to prevent regressions.
- Marked the related quick-win item as completed in `docs/TASKS.md`.

Result:

- `init --help` now provides clearer onboarding and conflict-resolution guidance.
- CLI help behavior is now validated by tests.

## 2026-02-13 - Request 027

Author: Gabriel Moreira

Request summary:

- Validate `SPEC.md` against implemented behavior via reverse engineering and update the spec where mismatches exist.

Key decisions:

- Updated `docs/SPEC.md` to reflect current shipped behavior in these areas:
  - deterministic constrained `cosmiconfig` search behavior
  - explicit `init` options (`--target`, `--preset`, `--force`, `--yes`)
  - baseline reminder tip visibility only in high-signal contexts
  - interactive baseline prompt scope for default/summary flows
  - `init` conflict-prevention behavior and numbered interactive prompts

Result:

- `SPEC.md` now matches runtime and tested CLI behavior more closely.
- The specification is clearer about current guardrails and UX contracts.

## 2026-02-13 - Request 028

Author: Gabriel Moreira

Request summary:

- Move AI changelog to the `docs` root, remove the old folder, and update all references.

Key decisions:

- Moved `docs/ai-updates/AI_CHANGELOG.md` to `docs/AI_CHANGELOG.md`.
- Removed the old `docs/ai-updates` directory.
- Updated every known reference path in project docs and README.

Result:

- AI changelog now lives at a simpler canonical location: `docs/AI_CHANGELOG.md`.
- Documentation links and process instructions are consistent with the new path.

## 2026-02-13 - Request 029

Author: Gabriel Moreira

Request summary:

- Investigate failing GitHub pipeline and fix it.

Key decisions:

- Identified failure cause from workflow logs: pnpm version mismatch between workflow setup (`10`) and repository `packageManager` (`pnpm@10.29.3`).
- Updated both GitHub workflows to pin `pnpm/action-setup` to `10.29.3`.

Result:

- CI and publish workflows are now aligned with repository package manager version policy.
- The setup phase should no longer fail due to pnpm version mismatch.

## 2026-02-13 - Request 030

Author: Gabriel Moreira

Request summary:

- Investigate current pipeline warnings/errors and fix the CJS build warning about `import.meta`.

Key decisions:

- Removed `import.meta` usage from CLI direct-execution bootstrap.
- Replaced it with a path/basename-based direct invocation guard that works for current CLI execution patterns.

Result:

- `tsup` CJS build warning (`import.meta` unavailable in CJS output) is eliminated.
- CLI behavior remains unchanged for normal direct execution (`node dist/index.js`, `tsx src/index.ts`, bin entry).

## 2026-02-13 - Request 031

Author: Gabriel Moreira

Request summary:

- Analyze latest CI failures and fix Node/tooling compatibility and failing test setup on Linux runners.

Key decisions:

- Updated CI matrix to Node 20 only to avoid `eslint-plugin-unicorn` runtime incompatibility on Node 18 (`toReversed` error).
- Hardened fixture-based tests by creating `packages/ws-a/node_modules/eslint/bin` before writing mock `eslint.js`.
- Made pnpm-isolated integration test resolve pnpm through `npm_execpath` when available, with command fallback.

Result:

- CI lint no longer fails from Node 18 + unicorn incompatibility.
- CLI integration/terminal tests no longer fail with ENOENT for missing fixture directories.
- pnpm isolated test execution is more reliable on Linux GitHub runners.

## 2026-02-13 - Request 032

Author: Gabriel Moreira

Request summary:

- Make minimum supported runtime explicit and fail fast on incompatible Node versions.

Key decisions:

- Added strict engine constraints:
  - root `package.json`: Node `>=20.0.0`, pnpm `>=10.29.3`
  - package `@eslint-config-snapshot/api`: Node `>=20.0.0`
  - package `@eslint-config-snapshot/cli`: Node `>=20.0.0`
- Added `.npmrc` with `engine-strict=true` to enforce failure on unsupported engines during install.
- Updated docs to reflect enforced minimum runtime:
  - `README.md` runtime requirements section
  - `docs/SPEC.md` runtime requirement updated to Node 20+

Result:

- Runtime expectations are now explicit for users and contributors.
- Incompatible Node versions fail early instead of failing later during lint/test/build.

## 2026-02-13 - Request 033

Author: Gabriel Moreira

Request summary:

- Fix remaining CI test failures caused by missing fixture ESLint binaries and invalid/non-JSON print-config extraction.

Key decisions:

- Made fixture-based CLI tests fully self-contained by creating mocked `eslint` binaries for both fixture workspaces (`ws-a` and `ws-b`) in test setup.
- Added mocked `eslint/package.json` files in setup to keep resolver behavior deterministic.
- Removed hidden dependency on untracked local fixture `node_modules` state.

Result:

- Integration and terminal tests no longer depend on residual local files.
- CI runners can execute tests deterministically from a clean checkout.

## 2026-02-13 - Request 034

Author: Gabriel Moreira

Request summary:

- Fix remaining CI failure in pnpm-isolated test due to `spawnSync .../bin/pnpm ENOENT`.

Key decisions:

- Reworked pnpm test command resolution to try multiple execution candidates:
  - `node <npm_execpath>` when `npm_execpath` points to pnpm
  - `pnpm` from PATH
  - `pnpm.cmd` on Windows
- Added ENOENT-aware fallback behavior to continue trying other candidates.

Result:

- pnpm-isolated test no longer depends on a fragile hardcoded pnpm path near the Node binary.
- Linux runner compatibility for pnpm command discovery is improved.

## 2026-02-13 - Request 035

Author: Gabriel Moreira

Request summary:

- Investigate npm publish failure (`ENEEDAUTH`) in GitHub release workflow and improve reliability.

Key decisions:

- Kept npm token-based publish flow and added explicit preflight validation in workflow:
  - fail early if `NPM_TOKEN` secret is missing
  - run `npm whoami` before publish to verify authentication
- Moved token wiring to job-level `NODE_AUTH_TOKEN` for consistent usage across steps.

Result:

- Publish workflow now surfaces missing/invalid auth with clear actionable messages.
- Release failures become easier to diagnose before package publish steps run.

## 2026-02-13 - Request 036

Author: Gabriel Moreira

Request summary:

- Migrate npm publish automation from token-based auth to Trusted Publishing (OIDC) and explain setup.

Key decisions:

- Updated publish workflow to rely on GitHub OIDC + npm trusted publishing flow.
- Removed token-specific preflight/auth steps from workflow.
- Kept `id-token: write` permission and `--provenance` publishing.
- Upgraded publish job runtime to Node 22 and added explicit tool version output for release diagnostics.

Result:

- Release pipeline is aligned with npm's recommended secure model for CI/CD.
- No long-lived npm publish token is required when trusted publishing is correctly configured.

## 2026-02-13 - Request 037

Author: Gabriel Moreira

Request summary:

- Adopt Changesets to automate and standardize package versioning according to chosen release tags.

Key decisions:

- Added `@changesets/cli` and initialized `.changeset` configuration.
- Set Changesets publish access to `public`.
- Added root scripts:
  - `pnpm changeset`
  - `pnpm release:version`
  - `pnpm release:publish`
- Updated npm publish workflow to publish through Changesets (`changeset publish`).
- Documented release flow in README.

Result:

- Versioning workflow is now standardized for monorepo packages.
- Reduced risk of mismatch between intended release version and published package versions.

## 2026-02-13 - Request 038

Author: Gabriel Moreira

Request summary:

- Prepare a new release version with Changesets, remove old tags, keep only the new release tag, and document release trigger flow in CONTRIBUTING.

Key decisions:

- Deleted previous release tag `v0.8.0` locally and on `origin`.
- Created a patch changeset for both publishable packages and applied versions to `0.1.1`.
- Kept release tag aligned with package versions (`v0.1.1`).
- Updated `docs/CONTRIBUTING.md` with explicit Changesets release steps and trigger options (`v*` tag and manual workflow dispatch).

Result:

- Repository is ready for a clean, version-aligned release tag flow.
- Documentation now explains exactly how to trigger releases with the current pipeline.

## 2026-02-13 - Request 039

Author: Gabriel Moreira

Request summary:

- Create and push a new release version to test the automated release flow.

Key decisions:

- Generated a new patch release via Changesets for both packages.
- Applied package versions to `0.1.2` with synchronized changelog updates.
- Replaced previous `v0.1.2` tag reference with a tag aligned to the new version commit.

Result:

- Repository now has a version-aligned release candidate for automated publish testing.

## 2026-02-13 - Request 040

Author: Gabriel Moreira

Request summary:

- Configure GitHub publish workflow to use a protected environment for release gating.

Key decisions:

- Added `environment: release` to the npm publish job.
- Kept tag trigger (`v*`) and OIDC trusted publishing permissions unchanged.

Result:

- Publish workflow can now be controlled by GitHub Environment protection rules (tag rules, reviewers, wait timer).

## 2026-02-13 - Request 041

Author: Gabriel Moreira

Request summary:

- Create and publish a new release version.

Key decisions:

- Generated a patch changeset for both publishable packages.
- Applied package version bump from `0.1.2` to `0.1.3`.
- Released through tag-aligned flow (`v0.1.3`).

Result:

- Repository is prepared for the next automated npm publish run with versions aligned to the new tag.

## 2026-02-13 - Request 042

Author: Gabriel Moreira

Request summary:

- Fix npm Trusted Publishing failure (`E422`) caused by provenance repository validation mismatch during `changeset publish`.

Key decisions:

- Added explicit repository metadata to all relevant package manifests:
  - root `package.json`
  - `packages/api/package.json`
  - `packages/cli/package.json`
- Used canonical GitHub repository URL expected by npm provenance:
  - `https://github.com/gabrielmoreira/eslint-config-snapshot`
- Added `homepage` and `bugs` metadata for completeness and clearer package registry metadata.

Result:

- Package manifests now include repository metadata required for npm provenance verification.
- Next tag-triggered publish run can validate repository identity against GitHub OIDC provenance.

## 2026-02-13 - Request 043

Author: Gabriel Moreira

Request summary:

- Ensure npm package pages show useful README content for both published packages.
- Add cross-references between CLI and API package documentation.

Key decisions:

- Added package-specific README files instead of duplicating the root README:
  - `packages/cli/README.md` focused on command-line usage.
  - `packages/api/README.md` focused on programmatic usage.
- Added cross-links in both READMEs:
  - CLI README links to API package.
  - API README links to CLI package.
- Added link from both package READMEs back to the root project README.

Result:

- npm pages for `@eslint-config-snapshot/cli` and `@eslint-config-snapshot/api` now have targeted documentation.
- Users can navigate clearly between CLI and API docs based on their use case.

## 2026-02-13 - Request 044

Author: Gabriel Moreira

Request summary:

- Bump patch version and publish the new release.

Key decisions:

- Used Changesets patch bump flow for both publishable packages to keep version alignment.
- Triggered publication through the existing tag-based GitHub workflow (Trusted Publishing).

Result:

- Versions were bumped and release tag was prepared/pushed to trigger automated npm publish.

## 2026-02-13 - Request 045

Author: Gabriel Moreira

Request summary:

- Add a command to show effective evaluated config (resolved runtime state, not dynamic source).
- Improve `init` with a recommended mode that supports workspace-to-group numeric assignment (default group 1), and make it the preferred path over minimal.

Key decisions:

- Added new CLI command:
  - `config` with `--format json|short` and `--short` alias.
  - Output includes source, resolved workspace input, discovered workspaces, evaluated group assignments, and sampling config.
- Enhanced `init` presets:
  - `recommended`, `minimal`, `full`
  - default preset changed to `recommended`
  - added `--show-effective` option to preview the evaluated config before writing
- Implemented recommended preset generation:
  - deterministic workspace discovery
  - interactive numeric group assignment per workspace (default `1`)
  - non-interactive (`--yes`) behavior keeps all workspaces in `group-1`
- Added monorepo fallback for init discovery when package-manager discovery resolves only `"."`:
  - reads workspace patterns from root `package.json`
  - expands patterns to deterministic workspace list

Result:

- Users can now inspect effective evaluated configuration directly via `eslint-config-snapshot config`.
- `init` now supports a recommended grouped workflow aligned with real workspace structure and simpler setup for multi-group scenarios.
- CLI integration and terminal tests were expanded and updated for the new command and preset behavior.

## 2026-02-13 - Request 046

Author: Gabriel Moreira

Request summary:

- Commit, push, and perform a minor version bump release.

Key decisions:

- Applied Changesets minor bump for both publishable packages to keep versions aligned.
- Used tag-driven release flow for GitHub publish automation.

Result:

- Packages were versioned to the next minor release and prepared for publish via pushed release tag.

## 2026-02-13 - Request 047

Author: Gabriel Moreira

Request summary:

- Refine recommended init UX:
  - avoid emitting explicit sampling in recommended output
  - provide richer terminal selection UX (checkbox style)
  - keep default runtime-discovered `*` group and assign numeric static groups only for explicit outliers

Key decisions:

- Reworked `recommended` preset generation:
  - `workspaceInput` now stays `discover`
  - `grouping.groups` now uses ordered first-match:
    - numbered static groups for selected outliers
    - trailing `default` group with `**/*`
  - no explicit `sampling` block is written in recommended config
- Introduced rich prompt UX with `@inquirer/prompts`:
  - checkbox to select workspaces outside default group
  - validated numeric input for each selected workspace group number
- Kept non-interactive `--yes` deterministic:
  - no outliers selected
  - generated recommended config keeps only default group
- Added fallback workspace pattern expansion from `package.json#workspaces` for init discovery when package-tool discovery returns only `"."`.

Result:

- Recommended init now matches the desired mental model: default `*` group for most projects and lightweight numbered exceptions only where needed.
- Interactive setup is richer and less error-prone than plain text entry.
- Tests and docs were updated to reflect the new behavior.

## 2026-02-13 - Request 048

Author: Gabriel Moreira

Request summary:

- Stabilize push-time test execution on Windows after introducing richer init behavior.

Key decisions:

- Isolated `cli.integration.test.ts` from shared mutable fixture state:
  - switched to per-test temporary fixture copy from immutable template
  - removed direct mutation of shared fixture directory across tests
- Kept integration suite sequential and retained deterministic mocked ESLint setup.

Result:

- Eliminated cross-file fixture races that caused intermittent pre-push failures (`EBUSY` / `ENOENT`) on Windows.
- Pre-push test gate now runs reliably with the updated integration setup.

## 2026-02-13 - Request 049

Author: Gabriel Moreira

Request summary:

- Ensure recommended init does not persist workspace discovery configuration and keeps dynamic behavior as the default.
- Generate static config only for explicit group overrides, with dynamic catch-all fallback for the rest.

Key decisions:

- Updated recommended config generation:
  - no `workspaceInput` persisted
  - no `sampling` persisted
  - if no overrides are selected, output is `{}` (fully dynamic)
  - if overrides exist, output contains only `grouping.mode=match` with ordered static `group-N` entries and trailing dynamic catch-all `default: ['**/*']`
- Added direct tests for config generation logic to lock this behavior.
- Updated terminal init assertions for `--yes --preset recommended` to expect `{}`.

Result:

- Recommended init now avoids duplicated workspace declarations and remains aligned with repository-native workspace resolution (npm/yarn/pnpm/etc.).
- Static grouping is only introduced when users explicitly opt into exceptions.

## 2026-02-13 - Request 050

Author: Gabriel Moreira

Request summary:

- Move remaining init prompt flows to Inquirer and remove numeric typed-choice UX.

Key decisions:

- Replaced numeric text prompt flow for init target/preset with Inquirer `select` prompts.
- Kept recommended grouping flow fully on Inquirer:
  - `checkbox` to pick outlier workspaces
  - `select` to assign each outlier to an existing or new static group
- Removed exported numeric parser helpers used only by old tests.
- Updated help text and tests to reflect select-based init UX.

Result:

- Init is now consistently driven by richer Inquirer prompts without numeric typed menu selection.
- CLI integration and terminal tests were updated and remain green.

## 2026-02-13 - Request 051

Author: Gabriel Moreira

Request summary:

- Bump a new minor release and push version updates to git.

Key decisions:

- Used Changesets minor bump for both publishable packages.
- Kept release aligned with current tag-driven publish workflow.

Result:

- Version files and package changelogs were updated for the next minor release and pushed.

## 2026-02-13 - Request 052

Author: Gabriel Moreira

Request summary:

- Make `init` wording clearer because users do not understand what "leave default group `*`" means in prompts and docs.

Key decisions:

- Clarified `init` help and interactive recommended-flow console text to explicitly define `*` as a dynamic catch-all group.
- Reworded recommended preset label and exception-selection prompt for clearer intent.
- Updated end-user docs (`README.md`, `docs/EXAMPLES.md`) and spec wording (`docs/SPEC.md`) to match the CLI mental model.
- Updated terminal integration assertion for `init --help` text.

Result:

- `init` now explains the grouping intent directly in plain language.
- Documentation and CLI output are aligned around the same default-group/catch-all explanation.

## 2026-02-13 - Request 053

Author: Gabriel Moreira

Request summary:

- Bump and push a new release after the latest init UX/doc clarity updates.

Key decisions:

- Chose a patch release for both packages because the change is additive UX/documentation clarification without API/command breaking changes.
- Kept the established Changesets release flow (version commit + git tag push).

Result:

- Prepared patch release metadata for both publishable packages and proceeded with version/push workflow.

## 2026-02-13 - Request 054

Author: Gabriel Moreira

Request summary:

- Fix runtime crash during `--update` when a rule appears with same severity but different options across sampled files.

Key decisions:

- Replaced hard-fail conflict behavior in `aggregateRules` with deterministic conflict resolution.
- Kept severity precedence unchanged.
- For same-severity conflicts:
  - prefer entries that include explicit options over bare severity-only entries
  - when both sides include options, pick lexicographically smaller canonicalized JSON to keep order-independent deterministic output
- Added tests for both conflict-resolution and explicit-options preference scenarios.

Result:

- CLI no longer crashes on mixed per-file option shapes for the same rule/severity.
- Snapshot generation remains deterministic and stable.

## 2026-02-13 - Request 055

Author: Gabriel Moreira

Request summary:

- Clarify documentation organization with fewer files and review which planning/review content is still useful.

Key decisions:

- Replaced `docs/IMPLEMENTATION_REVIEW.md` with `docs/FINDINGS.md` to make intent explicit.
- Restructured `docs/TASKS.md` into:
  - active tasks
  - exploration backlog
  - recently completed
- Removed obsolete task/review items (for example numbered init prompt follow-ups that no longer apply).
- Updated cross-references in `README.md`, `docs/AGENTS.md`, and `docs/CONTRIBUTING.md`.

Result:

- Documentation now follows a simpler and clearer model:
  - `TASKS.md` for action items
  - `FINDINGS.md` for active technical risks/limitations
- Current pending work is easier to scan and no longer mixed with historical completed context.

## 2026-02-13 - Request 056

Author: Gabriel Moreira

Request summary:

- Validate whether CJS `import.meta` warning and project scan backlog items are still accurate in docs.

Key decisions:

- Confirmed CJS `import.meta` warning is already resolved (current build is clean).
- Updated planning docs to remove that stale pending item.
- Clarified scan backlog wording to distinguish current partial v0 recommended assist from a future deep ESLint per-project inspection command.

Result:

- `TASKS.md` and `FINDINGS.md` now match implemented reality and avoid stale unresolved items.

## 2026-02-13 - Request 057

Author: Gabriel Moreira

Request summary:

- Improve CLI output consistency and visual quality with better headers, aligned counters, and clearer summary flow inspired by modern tooling UX.

Key decisions:

- Implemented a first-pass output system in summary mode (`check` default path) with explicit section titles and aligned bullet-style counters.
- Kept machine-oriented command outputs (`status`, `print --format json`) stable to avoid breaking script usage.
- Preserved existing drift detail formatting while improving top-level summary readability.

Result:

- Clean summary now prints a structured `Summary` section instead of a dense single line.
- Drift summary now prints a structured `Summary` section before grouped diff details.
- Existing CLI integration/terminal tests remain green after the output refinement.

## 2026-02-13 - Request 058

Author: Gabriel Moreira

Request summary:

- Continue CLI output consistency improvements and optimize extraction performance for large monorepos where subprocess-per-file is too slow.

Key decisions:

- Kept script-oriented outputs stable (`status`, `print --format json`) while improving human-facing summary output and documentation.
- Added a short output glossary in `README.md`.
- Implemented workspace-scoped batch extraction entrypoint:
  - prefer in-process ESLint API (`ESLint.calculateConfigForFile`) with one ESLint instance per workspace
  - keep deterministic fallback to existing subprocess `--print-config` extraction when API loading is unavailable
- Updated CLI snapshot computation to use batched workspace extraction and centralized recoverable-error filtering.
- Added API test coverage for multi-file workspace extraction flow.

Result:

- Large repos avoid repeated process startup overhead per sampled file when ESLint API is available, improving runtime significantly.
- Existing behavior remains compatible through fallback path.
- Quality gates remain green after the refactor.

## 2026-02-13 - Request 059

Author: Gabriel Moreira

Request summary:

- Publish a new minor version.

Key decisions:

- Release both packages as `minor` due to meaningful UX and runtime performance improvements delivered since the previous patch.
- Keep standard Changesets workflow (version, commit, tag, push).

Result:

- Minor release metadata added and release flow executed.

## 2026-02-13 - Request 060

Author: Gabriel Moreira

Request summary:

- Improve CI hygiene and developer UX with better runtime logs, dependency automation, and warning cleanup.

Key decisions:

- Updated CI matrix to run on `20.x`, `22.x`, and `latest`, with fail-fast enabled and a CLI smoke step.
- Added Renovate config (`renovate.json`) with grouped update strategy.
- Removed `shell: true` from isolated integration test process execution to avoid `DEP0190` warnings.
- Added runtime command context logs (TTY-only):
  - tool name and version
  - command label
  - repository path
  - detected config source
  - existing baseline summary
- Added command duration logging with interactive wait-time excluded via timer pause/resume around prompt flows.

Result:

- CI coverage across supported/current Node versions is stronger.
- Dependency maintenance workflow is automated and configurable.
- Interactive CLI runs provide clearer progress context and elapsed-time visibility without counting user prompt wait time.

## 2026-02-13 - Request 061

Author: Gabriel Moreira

Request summary:

- Clarify workspace ESLint runtime behavior, improve pnpm/corepack resilience in isolated integration tests, and expose ESLint runtime version context in command summaries.

Key decisions:

- Confirmed workspace-scoped ESLint resolution remains anchored to each workspace install via `createRequire`.
- Added API helper to resolve ESLint package version per workspace.
- Updated CLI summary flow to print ESLint runtime version context:
  - single line when all groups share one version
  - per-group breakdown when versions differ.
- Improved pnpm-isolated integration test command discovery with fallback order:
  - `npm_execpath` (when pnpm)
  - `corepack pnpm`
  - `pnpm` direct
- Kept graceful skip behavior for environments where pnpm is unavailable.

Result:

- Runtime diagnostics now include actionable ESLint version visibility per group.
- Isolated pnpm integration tests are more robust across heterogeneous CI environments.

## 2026-02-13 - Request 062

Author: Gabriel Moreira

Request summary:

- Improve CLI log tone consistency, reduce robotic wording, and add subtle emoji accents for a friendlier interactive experience.

Key decisions:

- Limited wording and emoji updates to TTY/progress-oriented logs to preserve script-stable outputs.
- Updated context header labels to be more conversational and readable.
- Standardized progress lines with a single style (`🔎 ...`) for analysis/resolution phases.
- Updated end-of-run timing line to a friendlier completion style with success/failure markers.

Result:

- Interactive CLI sessions now feel lighter and more human while maintaining deterministic command output behavior for tests and automation.

## 2026-02-13 - Request 063

Author: Gabriel Moreira

Request summary:

- Replace raw command labels in the runtime header with friendlier action phrases.

Key decisions:

- Added a command-to-display-label mapper for known actions (`check`, `update`, `print`, `config`, `init`, `help`).
- Kept a fallback to the raw command label for unknown/future commands.

Result:

- Runtime header now reads more naturally and is easier to scan for end users.

## 2026-02-13 - Request 064

Author: Gabriel Moreira

Request summary:

- Refine CLI log UX for a more human tone with less visual noise, clearer wording, and consistent section spacing.

Key decisions:

- Replaced terse technical phrasing with clearer human text for first-baseline prompts and analysis summary lines.
- Standardized runtime header layout and spacing between implicit output blocks.
- Reduced emoji usage to meaningful signal points and aligned icon usage for related lines.
- Updated terminal integration assertion to match new first-run wording.

Result:

- Interactive CLI output is now easier to read, less robotic, and visually consistent across runs.

## 2026-02-13 - Request 065

Author: Gabriel Moreira

Request summary:

- Improve CLI version detection robustness and prioritize package resolution over path heuristics.

Key decisions:

- Updated version resolution order to:
  1. npm environment package metadata when matching the CLI package
  2. `createRequire(...).resolve('@eslint-config-snapshot/cli')` and package-root lookup
  3. path-walk fallback from current entrypoint
- Kept deterministic `unknown` as last-resort fallback.

Result:

- CLI version display is now resilient across `npx`, workspace, and direct binary execution scenarios.

## 2026-02-13 - Request 066

Author: Gabriel Moreira

Request summary:

- Slightly increase default sampling coverage and improve default hint behavior for better file-type diversity.

Key decisions:

- Increased default `sampling.maxFilesPerWorkspace` from `8` to `10`.
- Added conservative default `hintGlobs` to prioritize representative config/setup and common architecture-layer files.
- Updated `full` scaffold defaults to match runtime defaults.

Result:

- Default runs now sample a bit more files and have better out-of-the-box diversity bias without major runtime impact.

## 2026-02-13 - Request 067

Author: Gabriel Moreira

Request summary:

- Improve sampling tokenization strategy using explicit domain token groups to increase representative file diversity.

Key decisions:

- Extended token extraction to consider both basename and directory tokens (with directory proximity bias).
- Added normalized token matching (`plural -> singular` heuristics) before priority scoring.
- Implemented known-token priority groups based on provided vocabulary:
  - group 2 terms as highest priority
  - group 3 terms as medium priority
  - group 1 terms as lower priority
- Kept existing deterministic fallback (non-generic token selection + uniform spacing) when no known token applies.

Result:

- Sampling now prefers semantically representative files more consistently in larger candidate sets.
- Updated sampling tests to match the new deterministic token-priority behavior.

## 2026-02-13 - Request 068

Author: Gabriel Moreira

Request summary:

- Prioritize representative sampling by selecting one file per discovered token first, then fill remaining slots by uniform region spacing.
- Treat the token group containing common app-layer kinds (`controller`, `helpers`, etc.) as the highest-priority group.

Key decisions:

- Reworked first-pass selection to explicit token buckets (`token -> files`) and pick one representative file per token.
- Ordered token selection by:
  1. token-group priority
  2. first occurrence in deterministic file order
  3. lexical tie-breaker
- Flipped token-group importance so the group with `controller/helpers/...` is now highest priority.
- Kept uniform spacing fallback only after token diversity is exhausted.

Result:

- Sampling now better captures potential rule-variance contexts across common file roles before region-based completion.
- Deterministic behavior preserved and verified by existing sampling tests.

## 2026-02-13 - Request 069

Author: Gabriel Moreira

Request summary:

- Guarantee that regional fallback selection covers at least three regions (top, middle, bottom) whenever possible.

Key decisions:

- Updated regional selector to seed explicit anchors (`first`, `middle`, `last`) when fallback count is at least 3.
- Kept deterministic distributed candidates after anchor seeding to fill remaining slots.
- Added dedicated sampling test to validate regional anchor behavior.

Result:

- Regional fallback now consistently includes top/middle/bottom coverage when there are 3+ fallback slots.
- All API sampling tests pass with deterministic output.

## 2026-02-13 - Request 070

Author: Gabriel Moreira

Request summary:

- Rebalance token priorities so the app-layer group (`controller/helpers/...`) is primary, and move `view/views`, `repository`, `route/routes` into that top-priority group.
- Keep the broader architectural token set (`manager/mapper/...`) as second priority.

Key decisions:

- Reordered `TOKEN_GROUP_PRIORITY` groups:
  - priority 1: app-layer/common-role tokens (including `view/views`, `repository`, `route/routes`)
  - priority 2: broader architecture tokens (including `manager`, `mapper`, etc.)
  - priority 3: infrastructure/support tokens
- Updated deterministic sampling expectation tests affected by the new ordering.

Result:

- Token-diversity selection now favors common app-role files earlier, increasing representativeness for typical project structures.
- API test suite remains green with updated deterministic outputs.

## 2026-02-13 - Request 071

Author: Gabriel Moreira

Request summary:

- Add opt-in debug diagnostics for sampling/extraction/command timing and include top-level emoji accents in key summary lines.

Key decisions:

- Added `debug`-based namespaces:
  - `eslint-config-snapshot:run`
  - `eslint-config-snapshot:workspace`
  - `eslint-config-snapshot:sampling`
  - `eslint-config-snapshot:extract`
  - `eslint-config-snapshot:diff`
  - `eslint-config-snapshot:timing`
- Kept default output behavior stable and clean; detailed logs are only shown with `DEBUG=eslint-config-snapshot:*`.
- Added debug traces for:
  - sampled candidate/selected files
  - extraction mode and spawned print-config command
  - per-workspace/group extraction stats
  - phase and total command timing
- Added subtle top-level emojis in summary/progress lines to improve readability without overloading output.

Result:

- Users can now inspect exact evaluated files, executed extraction commands, and timings on demand.
- Normal output remains concise, while top-level messages are slightly more friendly/scanable.

## 2026-02-13 - Request 072

Author: Gabriel Moreira

Request summary:

- Re-evaluate default sampling hint masks after debug output showed hints were too strict for common filenames like `config.ts`.

Key decisions:

- Expanded default `hintGlobs` to capture both suffix and direct-name variants:
  - direct names (`**/{config,setup}.{ext}`)
  - suffix names (`**/*.{config,setup}.{ext}`)
- Expanded architecture-role hints to include additional common roles (`view/views`) and directory-shaped patterns:
  - file suffix role hints
  - role directory hints (`**/{service,controller,...}/**/*.{ext}`)
- Kept deterministic sampling behavior unchanged.

Result:

- Hint matching is now less brittle and better aligned with real-world project naming patterns.
- API and CLI test suites remain fully passing.

## 2026-02-13 - Request 073

Author: Gabriel Moreira

Request summary:

- Remove `hintGlobs` from public sampling config and replace it with token-oriented hints.
- Allow config-driven token hints as either a flat array (`string[]`) or grouped arrays (`string[][]`).
- Keep `init --preset full` readable by avoiding a huge generated token block.

Key decisions:

- Removed `sampling.hintGlobs` usage and schema from runtime/config scaffolds.
- Added `sampling.tokenHints?: string[] | string[][]` in API config typing and sampling runtime.
- Sampling now uses token-priority maps derived from:
  - config-provided `tokenHints` when set
  - built-in default token groups when omitted
- `init --preset full` now emits only the first-priority token list (compact and practical), not the full internal taxonomy.
- Updated fixtures/tests/examples to the new config shape.

Result:

- Configuration surface is simpler and more semantic (token-based instead of glob-based hinting).
- Default behavior remains strong without extra config, and advanced users can still tune token priorities when needed.
- API and CLI tests remain green after migration.

## 2026-02-13 - Request 074

Author: Gabriel Moreira

Request summary:

- Clarify naming semantics for `tokenHints` so users immediately understand what the field means.

Key decisions:

- Kept the concise field name `tokenHints` (no rename to longer alternatives).
- Added explicit documentation text describing it as path/name-derived tokens used for representative sampling priority.

Result:

- Config readability improved without changing API surface.

## 2026-02-13 - Request 075

Author: Gabriel Moreira

Request summary:

- Keep root repository version in sync with package versions automatically during release versioning.

Key decisions:

- Added `scripts/sync-root-version.mjs` to sync root `package.json` version from package release version.
- Wired release flow to run sync automatically via:
  - `release:version = changeset version && node scripts/sync-root-version.mjs`
- Added release-process note to `docs/CONTRIBUTING.md`.

Result:

- Root version now advances together with package version bumps during standard Changesets release flow.

## 2026-02-13 - Request 076

Author: Gabriel Moreira

Request summary:

- Include workspace/project scope visibility in summary output by showing how many workspaces were scanned.

Key decisions:

- Added `workspaces scanned` counters to summary outputs in:
  - default/check summary mode
  - update summary mode
- Count is computed from unique workspace membership across current snapshot groups.

Result:

- Summary output now communicates scope coverage (`N` workspaces scanned), making drift interpretation more transparent.

## 2026-02-13 - Request 077

Author: Gabriel Moreira

Request summary:

- Split the large CLI implementation into separate modules with dedicated tests while preserving all current features and behavior.

Key decisions:

- Extracted output formatting logic from `packages/cli/src/index.ts` into `packages/cli/src/output.ts`.
- Extracted snapshot runtime/orchestration logic from `packages/cli/src/index.ts` into `packages/cli/src/runtime.ts`.
- Kept command contracts, aliases, and output behavior stable.
- Added focused unit tests for the new modules to avoid only relying on end-to-end coverage.

Result:

- CLI refactor completed without feature loss.
- Added `packages/cli/test/output.unit.test.ts` and `packages/cli/test/runtime.unit.test.ts`.
- Full quality gates pass after refactor:
  - `pnpm nx run-many -t build lint typecheck test`.

## 2026-02-13 - Request 078

Author: Gabriel Moreira

Request summary:

- Preserve all observed rule configuration combinations (`severity + options`) instead of keeping only one winning entry.
- Complete the CLI refactor with clearer responsibility boundaries beyond the first split.

Key decisions:

- Updated API snapshot model to support per-rule variant arrays when multiple combinations are observed.
- Kept compact single-entry encoding when only one combination exists, to avoid unnecessary verbosity.
- Implemented deterministic variant uniqueness and ordering for stable snapshots and diffs.
- Updated diff logic to compare variant sets and still keep existing off-rule intent handling.
- Continued CLI decomposition by moving initialization flow to `packages/cli/src/init.ts` and runtime presentation/timing utilities to `packages/cli/src/ui.ts`.

Result:

- Snapshot output now preserves multiple runtime combinations per rule deterministically.
- CLI architecture now has clearer module boundaries:
  - `index.ts` command wiring/orchestration
  - `runtime.ts` extraction/comparison orchestration
  - `output.ts` formatting/render helpers
  - `init.ts` init workflow
  - `ui.ts` run header/progress/timing presentation
- API and CLI tests were updated for the new snapshot encoding and now pass.
- Full quality gates pass:
  - `pnpm nx run-many -t build lint typecheck test`.

## 2026-02-13 - Request 079

Author: Gabriel Moreira

Request summary:

- Improve CLI architecture so `index.ts` is parser/dispatcher-focused.
- Add a semantic terminal abstraction for I/O, TTY awareness, prompts, and run-timing behavior.
- Continue command decomposition into dedicated modules instead of concentrating execution logic in one file.

Key decisions:

- Introduced `TerminalIO` as a semantic I/O utility (`packages/cli/src/terminal.ts`) with:
  - TTY and interactive capability properties
  - semantic output helpers
  - paused run-timer support
  - `askYesNo` prompt helper
- Moved project-specific run header/version presentation into `packages/cli/src/presentation.ts`.
- Split command execution into dedicated modules:
  - `packages/cli/src/commands/check.ts`
  - `packages/cli/src/commands/update.ts`
  - `packages/cli/src/commands/print.ts` (including `config`)
- Reduced `packages/cli/src/index.ts` to command parsing, option validation, and command dispatch wiring.
- Removed obsolete `packages/cli/src/ui.ts` and updated unit tests to target terminal responsibilities.

Result:

- CLI responsibility boundaries are clearer and closer to the API package modular style.
- Terminal concerns are centralized and reusable.
- `index.ts` now primarily handles CLI contract wiring.
- Full quality gates pass:
  - `pnpm nx run-many -t build lint typecheck test`.

## 2026-02-13 - Request 080

Author: Gabriel Moreira

Request summary:

- Ensure multi-variant rule arrays are sorted by stable canonical value order (not insertion order).
- Consolidate color handling in terminal abstraction instead of keeping color logic in output formatting helpers.

Key decisions:

- Updated variant ordering to canonical JSON lexical sorting in snapshot aggregation.
- Removed color-creation logic from `output` module.
- Moved and centralized color capability handling inside `TerminalIO`, including no-color behavior based on terminal support/environment.
- Updated check command rendering to consume terminal-provided color methods.

Result:

- Variant arrays are now insertion-independent and deterministically sorted by stable canonical string representation.
- CLI color behavior is fully encapsulated in terminal I/O abstraction.
- Output module now remains focused on pure formatting transformations.

## 2026-02-13 - Request 081

Author: Gabriel Moreira

Request summary:

- Ensure Markdown files (`.md`, `.mdx`) are part of default ESLint sampling globs.
- Reassess CLI naming/structure around formatter/output and presentation responsibilities to avoid unnecessary complexity.

Key decisions:

- Kept Markdown support in built-in defaults and scaffold defaults, and added explicit test coverage to prevent regressions.
- Renamed CLI `presentation` module to `run-context` to make intent clearer (runtime header/context rendering), while keeping formatters focused on pure text formatting.
- Preserved current split (`terminal` I/O, `run-context` contextual header/metadata, `formatters` pure formatting) as the minimum separation that keeps responsibilities understandable without over-splitting.

Result:

- Default sampling includes `md/mdx` with test protection.
- CLI module naming is clearer and less ambiguous than `presentation`/`output`.
- Behavior remains unchanged; only clarity and maintainability improved.

## 2026-02-13 - Request 082

Author: Gabriel Moreira

Request summary:

- Include `json` and `css` in default sampling globs.
- Keep stronger sampling bias toward code files (`ts/js` families) before documentation or config assets.
- Reassess whether extra CLI source grouping is needed.

Key decisions:

- Extended default sampling globs and `full` scaffold globs to include `json` and `css`.
- Kept `md` and `mdx` included.
- Implemented deterministic code-first sampling fill:
  - token-diverse selection now runs in two passes (preferred code files first, non-code second),
  - uniform fill also consumes preferred files first before non-preferred candidates.
- Added/updated tests to cover the expanded default glob and code-first behavior.

Result:

- Defaults now sample `js/jsx/ts/tsx/cjs/mjs/md/mdx/json/css`.
- Sampling remains deterministic and now better reflects likely ESLint rule variance from code paths.
- API quality gates pass for this change set (`test`, `lint`, `typecheck`).

## 2026-02-13 - Request 083

Author: Gabriel Moreira

Request summary:

- Add a clear but lightweight explanation of API/CLI source file division.
- Document what should and should not live in each module area, without rigid over-constraints.

Key decisions:

- Added `docs/ARCHITECTURE.md` as practical guidance (not hard law).
- Documented package boundaries, per-file intent, and simple do/don't rules for `api` and `cli`.
- Included a compact end-to-end flow section and evolution guidelines to reduce future architecture drift.
- Linked the new architecture document from the project README documentation section.

Result:

- Architecture intent is now explicit for contributors.
- Guidance remains pragmatic and flexible instead of overly prescriptive.
- Future refactors have a clear baseline for deciding where code should live.

## 2026-02-13 - Request 084

Author: Gabriel Moreira

Request summary:

- Fix CI test failures where isolated npm/pnpm integration suites expected a single rule entry while runtime now correctly emits multi-variant rule entries.

Key decisions:

- Updated isolated integration test assertions for `no-console` to match the canonical multi-variant encoding (`[['error'], ['warn']]`).
- Kept implementation behavior unchanged, since runtime output was already correct and consistent with the promoted snapshot model.

Result:

- `cli.npm-isolated.integration.test.ts` and `cli.pnpm-isolated.integration.test.ts` now assert the correct snapshot shape.
- `pnpm nx run cli:test` passes locally with all suites green.

## 2026-02-13 - Request 085

Author: Gabriel Moreira

Request summary:

- Add richer GitHub pipeline reporting similar to Azure DevOps test/coverage capture.
- Expose clearer test and coverage visibility in CI run outputs.

Key decisions:

- Added a dedicated `reports` job to `.github/workflows/ci.yml` (Node 22) after validation succeeds.
- Configured per-package Vitest execution with:
  - JUnit output (`test-results/junit.xml`)
  - coverage outputs (`text-summary`, `json-summary`, `cobertura`)
- Added test report publishing via `dorny/test-reporter`.
- Added coverage summary publishing via `irongut/CodeCoverageSummary`.
- Added artifact upload for test and coverage report files.
- Added `@vitest/coverage-v8` and documented it in `docs/DEPENDENCIES.md`.

Result:

- CI now surfaces richer test and coverage reporting directly in GitHub workflow runs.
- Coverage and JUnit outputs are retained as downloadable artifacts for debugging/history.
- Existing local test flow remains unchanged.

## 2026-02-13 - Request 086

Author: Gabriel Moreira

Request summary:

- Fix CI failures introduced by the reports workflow (CLI test failures under coverage mode and report publication permissions).

Key decisions:

- Updated `.github/workflows/ci.yml` reports job to run `pnpm nx run-many -t build` before coverage test runs, ensuring CLI integration tests can resolve built artifacts (`packages/cli/dist` and API package entry points).
- Added top-level workflow permissions for checks/pull-requests and hardened `dorny/test-reporter` step with:
  - conditional execution for safe PR contexts,
  - `continue-on-error: true`,
  - `fail-on-error: false`.
- Updated CLI entrypoint shutdown behavior to use `process.exitCode` instead of immediate `process.exit(...)` to avoid stdout truncation risk in instrumented/coverage subprocess environments.

Result:

- Coverage-enabled CLI test execution is stable locally.
- Reports workflow no longer depends on unavailable dist artifacts.
- Test report publication is resilient to GitHub token scope limitations in restricted PR contexts.

## 2026-02-13 - Request 087

Author: Gabriel Moreira

Request summary:

- Ensure generated test result artifacts are ignored by git and review if additional ignore entries are needed.

Key decisions:

- Added ignore rules for generated report outputs and local Vitest cache:
  - `**/test-results/`
  - `*.junit.xml`
  - `.vitest/`
- Kept existing ignore entries for coverage and build outputs unchanged.

Result:

- Test/coverage report files generated locally are no longer surfaced as untracked changes.
- Repository cleanliness is improved for day-to-day local runs and CI parity.
