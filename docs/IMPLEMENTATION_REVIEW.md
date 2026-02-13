# Implementation Review

## Scope

This report summarizes implementation alignment, test hardening, and known remaining limitations.

## Current Alignment Highlights

1. Configuration discovery uses `cosmiconfig` with deterministic ordered `searchPlaces`.
2. Snapshot loading supports nested group IDs by scanning `**/*.json`.
3. Snapshot writing creates parent directories for group IDs that include path separators.
4. ESLint resolution remains workspace-scoped.
5. Workspace package architecture is consolidated to two packages (`api`, `cli`) with internal API modules.

## Test Coverage Improvements

1. Added positive and negative config-loading tests:
- deterministic precedence
- `package.json` field loading
- `.eslint-config-snapshotterrc.json` loading
- sync function and async function exports
- invalid export type rejection

2. Added rule aggregation edge-case tests:
- highest-severity option selection
- same-severity option conflict rejection

3. Added extract negative tests:
- unresolved ESLint in workspace
- invalid JSON from `--print-config`
- non-zero `--print-config` process exit

4. Added terminal-invoked CLI tests with exact output assertions:
- `help`, unknown command
- `snapshot`, `compare` clean/changed
- `status` clean/changed
- `print`
- `init` success/error
- runtime error surfacing
- `package.json` cosmiconfig loading path

## Remaining Limitations

1. CLI build still emits a CJS warning for `import.meta` in dual-format output.
2. Windows command execution in isolated tests may require `shell: true` for `.cmd` launchers.
3. Nx `run-many` may emit listener warnings in large local runs.

## Deprecated API Follow-up

1. The new `deprecate/member-expression` guard is configured for common Node deprecations (`fs.rmdir*`, `url.parse`, legacy `util.is*` helpers).
2. Current codebase scan did not find direct matches for configured deprecated members.
3. Future task: expand deprecated checks for dynamic/aliased access patterns that static member matching cannot detect.
