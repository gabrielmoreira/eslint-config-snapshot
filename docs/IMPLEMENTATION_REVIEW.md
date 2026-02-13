# Implementation Review (SPEC Alignment)

## Scope

Revisao completa da implementacao em relacao ao `SPEC.md`, com correcoes, simplificacoes e ampliacao de testes.

## Improvements Applied

1. Config resolution now follows SPEC exactly.
- Removed non-spec config locations (`package.json`, `.rc*`, yaml/json loaders).
- Resolution checks only the 6 filenames from SPEC, in exact order, first match wins.
- Kept support for `object`, `function`, and `async function` exports.
- Files changed:
`packages/config/src/index.ts`
`packages/config/test/config.test.ts`

2. Standalone/group IDs with slashes are now robust.
- Snapshot writer now creates nested directories when `groupId` contains `/`.
- Snapshot loader now scans recursively (`**/*.json`) so `compare/status` work with standalone group IDs like `packages/ws-a`.
- Files changed:
`packages/snapshot/src/index.ts`
`packages/cli/src/index.ts`

3. Integration tests were significantly expanded.
- Added grouped matching scenario with ordered rules and first-match wins assertions.
- Added standalone grouping scenario and roundtrip compare validation.
- Added isolated `pnpm` integration test (workspace-local ESLint install per workspace).
- Kept existing isolated `npm` integration test and aligned fixtures to spec-based config file loading.
- Files changed:
`packages/cli/test/cli.integration.test.ts`
`packages/cli/test/cli.pnpm-isolated.integration.test.ts`
`packages/cli/test/fixtures/npm-isolated-template/eslint-config-snapshotter.config.mjs`
`packages/cli/test/fixtures/npm-isolated-template/package.json`

4. Documentation was corrected.
- `README` now documents only spec-approved config file resolution.
- Added notes about grouped/standalone coverage and isolated `pnpm` integration test.
- Removed outdated dependency justification for `cosmiconfig`.
- Files changed:
`README.md`
`docs/DEPENDENCIES.md`

## Inconsistencies Found (Before Fix)

1. Config loading exceeded SPEC.
- Previous behavior accepted `package.json` and `.eslint-config-snapshotterrc*`, which is outside SPEC.

2. Standalone mode could break snapshot persistence.
- Group IDs containing `/` could create nested paths not discovered by non-recursive loader.

## Remaining Limitations

1. CLI build emits a CJS warning for `import.meta`.
- `tsup` warns because `import.meta` is ESM-only while CLI is built as `esm,cjs`.
- Functional behavior is currently correct in tests, but warning remains.

2. Windows isolated tests use `shell: true`.
- Needed for reliable execution of `npm.cmd`/`pnpm.cmd` in this environment.
- Triggers Node `DEP0190` warning in test logs.

3. Nx run-many emits `MaxListenersExceededWarning`.
- Warning appears during large run-many executions; does not currently fail builds/tests.

## TODOs

1. Evaluate removing CJS CLI output.
- Option: ship CLI as ESM-only or add entrypoint guards that avoid `import.meta` in CJS build.

2. Harden isolated integration runner abstraction.
- Option: execute package manager JS entrypoints via `node` to avoid `shell: true` on Windows.

3. Add explicit stress tests for conflicting same-severity options across multiple sampled files in one group.
- Behavior is implemented, but additional integration-level coverage can be increased.

## Decisions Taken

1. Prefer strict spec conformance over convenience config discovery.
- Decision: drop extra loaders and keep only the 6 canonical filenames.

2. Preserve standalone `groupId` semantics.
- Decision: keep `groupId` as workspace path string and support nested snapshot files, instead of mutating IDs.

3. Add both isolated package-manager paths.
- Decision: keep npm-isolated test and add pnpm-isolated test, since both expose workspace-scoped ESLint resolution behavior.

4. Keep warning-only issues as documented limitations.
- Decision: do not over-optimize warning cleanup in the same pass to avoid unrelated behavior changes.
