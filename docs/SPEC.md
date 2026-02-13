# ESLint Config Snapshotter

## Specification Authority

This document (SPEC.md) defines the base technical specification.

AGENTS.md defines execution rules for agents.

TASKS.md defines execution order.

SPEC_ENHANCED.md defines approved staged enhancements and explicit deviations from this base specification.

All implementation MUST follow SPEC.md plus SPEC_ENHANCED.md.

No behavior may contradict SPEC.md unless SPEC_ENHANCED.md explicitly overrides that behavior.

---

# 0. Overview

ESLint Config Snapshotter is a deterministic CLI tool that captures and compares the effective ESLint rule configuration across workspaces in a repository.

The tool does not lint code. It only observes the resolved ESLint configuration and records the final aggregated rule state.

Its purpose is to detect meaningful ESLint rule changes over time while producing snapshot files that are:

- extremely stable
- minimal in size
- deterministic across machines and environments
- easy to read and review
- clean in Git diffs

Snapshot files store only the final aggregated rule state. They never store volatile or intermediate data.

---

# 1. Core Design Principles

The system is designed around the following principles.

Determinism  
Same repository state must produce identical snapshot files across machines, OS, and runs.

Minimal Snapshot Output  
Snapshots store only meaningful ESLint rule state.

Git Diff Stability  
Snapshots must not change unless ESLint rule state changes.

Workspace Isolation  
Each workspace resolves ESLint relative to itself.

Human Readability  
Snapshots must be readable without tooling.

No Volatile Metadata  
No timestamps, hashes, sampled files, or environment data are stored.

Extensibility  
Tool is implemented as a TypeScript monorepo supporting future plugins and extensions.

Strict Deterministic Ordering  
All output structures must use stable key ordering and sorted arrays to guarantee identical output across runs.

---

# 2. Repository Architecture (TypeScript Monorepo)

The project must be implemented as a TypeScript monorepo.

Recommended layout:

<code>
repo/
  package.json
  pnpm-lock.yaml
  nx.json
  tsconfig.base.json
  eslint.config.js

  packages/
    cli/
    api/
    core/
    config/
    workspace/
    sampling/
    extract/
    snapshot/
    diff/
</code>

Responsibilities:

cli  
CLI commands and orchestration only.

api  
Stable public API exported for use in user configs.

core  
Shared utilities (normalization, canonicalization, stable sorting).

config  
Config loading, validation, and evaluation.

workspace  
Workspace discovery and group assignment.

sampling  
Representative file selection.

extract  
ESLint resolution and rule extraction.

snapshot  
Snapshot serialization and reading.

diff  
Snapshot comparison.

All source code must be TypeScript.

Each package MUST define Nx targets:

<code>
build
typecheck
lint
test
</code>

---

# 3. Tooling Requirements

Language: TypeScript  
Runtime: Node.js 18+

Testing: Vitest ecosystem  
Linting: ESLint (must dogfood ESLint)

Build: fast deterministic JS build (esbuild or equivalent) with TypeScript used for typechecking.

Snapshot serialization must use deterministic JSON output.

Tool must not depend on a specific package manager at runtime.

Allowed runtime dependencies must be stable, widely adopted, and justified.

Workspace discovery must use:

<code>
@manypkg/get-packages
</code>

Glob engine must use a deterministic, cross-platform implementation such as:

<code>
fast-glob
</code>

---

# 4. Workspace Discovery

Default discovery must use:

<code>
@manypkg/get-packages
</code>

Discovery result:

<code>
type WorkspaceDiscovery = {
  rootAbs: string
  workspacesRel: string[]
}
</code>

Normalization requirements:

- forward slashes only
- relative to rootAbs
- no trailing slash
- sorted alphabetically
- unique

If root cannot be determined, compute lowest common ancestor.

---

# 5. Workspace Input Modes

Workspace input supports two modes.

discover (default):

<code>
workspaceInput: {
  mode: 'discover'
}
</code>

manual:

<code>
workspaceInput: {
  mode: 'manual'
  rootAbs?: string
  workspaces: string[]
}
</code>

Manual mode skips discovery entirely.

Provided workspaces MUST be normalized and sorted.

---

# 6. Workspace Grouping Model

Grouping is defined using ordered match rules.

Config:

<code>
grouping: {
  mode: 'match' | 'standalone'
  allowEmptyGroups?: boolean

  groups?: Array<{
    name: string
    match: string[]
  }>
}
</code>

match mode (default):

- groups evaluated in order
- first matching group wins
- supports negative patterns using "!"
- workspace must match at least one positive pattern
- workspace must not match any negative pattern

Example:

<code>
grouping: {
  mode: 'match',
  groups: [
    { name: 'ops', match: ['ops-services/**'] },
    { name: 'modern', match: ['packages/**', '!packages/legacy/**'] },
    { name: 'default', match: ['**/*'] }
  ]
}
</code>

standalone mode:

Each workspace becomes its own group.

---

# 7. Group Assignment Algorithm

Pseudo:

<code>
function assignGroupsByMatch(workspacesRel, groups):
  assignments = new Map()

  for group in groups:
    assignments[group.name] = []

  unmatched = []

  for ws in sorted(workspacesRel):
    assigned = false

    for group in groups:
      if matches(ws, group.match):
        assignments[group.name].push(ws)
        assigned = true
        break

    if not assigned:
      unmatched.push(ws)

  if unmatched not empty:
    throw deterministic error listing unmatched workspaces

  return assignments
</code>

---

# 8. Representative File Sampling

Sampling exists only to extract ESLint config.

Sampling config:

<code>
sampling: {
  maxFilesPerWorkspace: number
  includeGlobs: string[]
  excludeGlobs: string[]
  hintGlobs: string[]
}
</code>

Rules:

- deterministic selection
- normalized relative paths
- sorted alphabetically
- stable selection

If workspace contains no matching files:

- do not fabricate files
- workspace contributes no rules

Sampled files must never be stored in snapshot.

---

# 9. ESLint Resolution (Workspace Scoped)

Each workspace resolves ESLint independently.

Pseudo:

<code>
function resolveEslintBinForWorkspace(workspaceAbs):
  req = createRequire(anchorFileInsideWorkspace)
  return req.resolve('eslint/bin/eslint.js')
</code>

Execution:

<code>
node eslintBin --print-config fileAbs
</code>

cwd MUST equal workspaceAbs.

If ESLint cannot be resolved from workspace:

- tool MUST throw deterministic error
- tool MUST NOT fall back to root ESLint

---

# 10. Rule Extraction and Normalization

Extract rules from ESLint output.

Normalize severity:

<code>
0 -> "off"
1 -> "warn"
2 -> "error"
</code>

Canonicalization:

<code>
function canonicalizeJson(value):
  if primitive:
    return value

  if array:
    return value.map(canonicalizeJson)

  if object:
    result = {}
    for key in sortedKeys(value):
      if value[key] != undefined:
        result[key] = canonicalizeJson(value[key])
    return result
</code>

---

# 11. Rule Aggregation

Aggregation is performed per group.

Rules:

- include all rules observed
- severity = highest severity observed

Options handling policy:

If same rule appears with different options:

Case 1: different severities  
Use options from configuration with highest severity.

Case 2: same severity, different options  
Tool MUST throw deterministic error requiring manual resolution.

Final rule representation format:

<code>
"rule-name": ["severity"]
</code>

or

<code>
"rule-name": ["severity", { options }]
</code>

Severity MUST always be string:

<code>
"off"
"warn"
"error"
</code>

Rules MUST be sorted alphabetically.

---

# 12. Snapshot File Format (Final)

Snapshots use JSON.

Object key order MUST be:

<code>
formatVersion
groupId
workspaces
rules
</code>

Format:

<code>
{
  "formatVersion": 1,
  "groupId": "string",
  "workspaces": ["workspace/path"],
  "rules": {
    "rule-name": ["severity"],
    "rule-name": ["severity", { "option": true }]
  }
}
</code>

Example:

<code>
{
  "formatVersion": 1,
  "groupId": "default",
  "workspaces": [
    "packages/a",
    "packages/b"
  ],
  "rules": {
    "eqeqeq": ["error", "always"],
    "no-console": ["warn"],
    "no-debugger": ["off"],
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
</code>

Workspaces MUST be sorted alphabetically.

Rules MUST be sorted alphabetically.

---

# 13. Snapshot Serialization Rules

Serialization MUST use:

- JSON.stringify
- indent = 2
- stable key order
- newline at EOF

Pseudo:

<code>
function writeSnapshotFile(path, snapshot):
  json = JSON.stringify(snapshot, null, 2)
  writeFile(path, json + "\n")
</code>

---

# 14. Snapshot Files Must NOT Contain

Never store:

- sampled files
- timestamps
- hashes
- versions
- environment info
- ESLint paths
- diagnostics
- cache metadata

Snapshots store only rule state.

---

# 15. Snapshot Comparison

Comparison detects:

introduced rules  
removed rules  
severity changes  
option changes  
workspace membership changes  

Comparison MUST use canonicalized JSON structures.

---

# 16. CLI Commands

snapshot

<code>
discoverWorkspaces
assignGroups
sampleFiles
extractRules
aggregateRules
writeSnapshots
</code>

compare

<code>
same as snapshot
loadSnapshots
diff
exit non-zero if changes
</code>

status

<code>
same as compare
minimal output
</code>

print

<code>
print aggregated rules
</code>

init

<code>
generate config scaffold
</code>

---

# 17. CLI Exit Codes

snapshot  
exit 0 on success

compare  
exit 0 if no changes  
exit 1 if changes exist

status  
exit 0 if clean  
exit 1 if changes exist

print  
exit 0 always

init  
exit 0 on success  
exit 1 on error

---

# 18. Public API

Package:

<code>
@eslint-config-snapshotter/api
</code>

Exports:

<code>
discoverWorkspaces(options?): Promise<WorkspaceDiscovery>

normalizePath(path): string

sortUnique(list): string[]

assignGroupsByMatch(workspacesRel, groups): GroupAssignment[]

resolveEslintBinForWorkspace(workspaceAbs): string
</code>

---

# 19. Configuration File Resolution

Configuration loading MUST use `cosmiconfig`.

The explorer MUST use deterministic `searchPlaces` in this exact order:

<code>
.eslint-config-snapshotter.js
.eslint-config-snapshotter.cjs
.eslint-config-snapshotter.mjs
eslint-config-snapshotter.config.js
eslint-config-snapshotter.config.cjs
eslint-config-snapshotter.config.mjs
package.json
.eslint-config-snapshotterrc
.eslint-config-snapshotterrc.json
.eslint-config-snapshotterrc.yaml
.eslint-config-snapshotterrc.yml
.eslint-config-snapshotterrc.js
.eslint-config-snapshotterrc.cjs
.eslint-config-snapshotterrc.mjs
</code>

Resolution order is exactly as listed.

If multiple exist, first match wins.

For `package.json`, config MUST be read from the `eslint-config-snapshotter` field.

Config may export:

<code>
object
function
async function
</code>

Functions MUST be executed.

Async functions MUST be awaited.

---

# 20. Default Configuration

Default config MUST be:

<code>
{
  workspaceInput: { mode: 'discover' },

  grouping: {
    mode: 'match',
    groups: [
      { name: 'default', match: ['**/*'] }
    ]
  },

  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**'],
    hintGlobs: []
  }
}
</code>

---

# 21. Determinism Requirements

Determinism enforced via:

- sorted keys everywhere
- canonical JSON normalization
- workspace scoped ESLint resolution
- no volatile metadata
- normalized paths
- stable serialization

---

# 22. Testing Requirements

Testing must use Vitest.

Test types:

unit tests  
integration tests  
snapshot tests  

Integration tests MUST include fixture monorepo with multiple ESLint versions.

Must verify:

- normalization correctness
- aggregation correctness
- workspace isolation
- snapshot stability

---

# 23. Non Goals

Tool must not:

lint code  
modify ESLint config  
modify source code  
depend on specific package manager  

---

# 24. Final Result

This design produces snapshot files that are:

minimal  
stable  
deterministic  
human readable  
Git friendly  
monorepo safe  
ESLint aligned  

and extensible for future plugins and extensions.

---
