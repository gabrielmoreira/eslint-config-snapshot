# @eslint-config-snapshot/cli

## 1.2.0

### Minor Changes

- Minor release: centralize shared command execution flow with reusable snapshot preparation executor.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@1.2.0

## 1.1.1

### Patch Changes

- Patch release: improve OSS compatibility workflow checks and align CLI zero-config print tolerance.
- Updated dependencies
  - @eslint-config-snapshot/api@1.1.1

## 1.1.0

### Minor Changes

- Minor release: improve skipped workspace messaging and OSS compatibility documentation.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@1.1.0

## 1.0.0

### Major Changes

- Promote the project to stable 1.0.0 release.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@1.0.0

## 0.14.1

### Patch Changes

- Bump package versions for the latest CI-driven publish-dispatch flow improvements.
- Updated dependencies
  - @eslint-config-snapshot/api@0.14.1

## 0.14.0

### Minor Changes

- Improve repository hygiene by expanding .gitignore for generated test report artifacts and Vitest local cache.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.14.0

## 0.13.0

### Minor Changes

- Add richer GitHub CI reporting with JUnit test publication and coverage summaries.
  Include Vitest coverage provider dependency for report generation.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.13.0

## 0.12.1

### Patch Changes

- Add architecture guidance for API/CLI module boundaries and responsibilities.
  Link architecture doc from README.
- Updated dependencies
  - @eslint-config-snapshot/api@0.12.1

## 0.12.0

### Minor Changes

- Add json/css to default sampling globs, keep md/mdx, and prioritize code files during sampling selection.
  Rename CLI presentation module to run-context and keep formatter/runtime boundaries clearer.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.12.0

## 0.11.0

### Minor Changes

- b3c8406: Automate root version synchronization during release versioning and improve token-hint sampling configuration clarity.

### Patch Changes

- Updated dependencies [b3c8406]
  - @eslint-config-snapshot/api@0.11.0

## 0.10.0

### Minor Changes

- 1f6f0fc: Replace sampling hint globs with configurable `tokenHints` and improve sampling documentation clarity.

### Patch Changes

- Updated dependencies [1f6f0fc]
  - @eslint-config-snapshot/api@0.10.0

## 0.9.0

### Minor Changes

- Release minor version with robust CLI version resolution and improved runtime log UX.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.9.0

## 0.8.0

### Minor Changes

- Release minor version with improved human-readable CLI runtime logs and consistent output spacing.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.8.0

## 0.7.0

### Minor Changes

- Release minor version after improving runtime command header messaging and UX consistency.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.7.0

## 0.6.0

### Minor Changes

- Release minor version with improved interactive CLI logging tone and richer runtime context reporting.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.6.0

## 0.5.0

### Minor Changes

- Add ESLint runtime version reporting by group in CLI summaries and improve pnpm/corepack isolated test resilience.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.5.0

## 0.4.0

### Minor Changes

- Minor release with improved CLI output consistency and faster workspace extraction using ESLint API fallback strategy.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.4.0

## 0.3.2

### Patch Changes

- Fix deterministic aggregation when same-severity ESLint rule options differ across sampled files, preventing update crashes.
- Updated dependencies
  - @eslint-config-snapshot/api@0.3.2

## 0.3.1

### Patch Changes

- Release patch bump after init UX clarity improvements for default catch-all group messaging.
- Updated dependencies
  - @eslint-config-snapshot/api@0.3.1

## 0.3.0

### Minor Changes

- Release minor with inquirer-based init UX and recommended dynamic grouping behavior.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.3.0

## 0.2.0

### Minor Changes

- Add effective config inspection command and recommended grouped init workflow with numeric workspace assignments.

### Patch Changes

- Updated dependencies
  - @eslint-config-snapshot/api@0.2.0

## 0.1.5

### Patch Changes

- Add package-level README files for npm pages with cross-links between CLI and API docs.
- Updated dependencies
  - @eslint-config-snapshot/api@0.1.5

## 0.1.4

### Patch Changes

- Fix npm trusted publishing provenance metadata by adding repository/homepage/bugs fields to package manifests.
- Updated dependencies
  - @eslint-config-snapshot/api@0.1.4

## 0.1.3

### Patch Changes

- Release patch version to validate trusted publishing flow with protected release environment.
- Updated dependencies
  - @eslint-config-snapshot/api@0.1.3

## 0.1.2

### Patch Changes

- Test release bump to validate automated publish flow with aligned package versions and tag.
- Updated dependencies
  - @eslint-config-snapshot/api@0.1.2

## 0.1.1

### Patch Changes

- Release patch version for API and CLI packages using the new Changesets workflow.
- Updated dependencies
  - @eslint-config-snapshot/api@0.1.1
