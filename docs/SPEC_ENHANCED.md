# SPEC_ENHANCED.md

## Active Staged Enhancement

### Rule Catalog Discovery (Research Branch)

Status: staged (not yet promoted to `SPEC.md`)

Add a new CLI command to surface rules that are available in installed ESLint runtime/plugin packages but are not currently observed in sampled effective config output.

Scope of this staged enhancement:

- Add `catalog` command with formats:
  - `--format json|short`
  - `--short` alias
  - `--missing` to focus on "available but not observed" rule sets.
- Add catalog baseline commands:
  - `catalog-update` to write deterministic per-group catalog baselines
  - `catalog-check` to diff current catalog data against catalog baseline files
- Discover available rules per workspace using workspace-scoped module resolution:
  - ESLint core builtin rules (`eslint/use-at-your-own-risk`),
  - plugin packages found through workspace/root `node_modules` scan and dependency metadata.
- Aggregate catalog data by resolved snapshot group.
- Keep deterministic ordering for all catalog outputs.
- Include severity-level breakdown in catalog usage stats (`error`, `warn`, `off`) in addition to active/inactive/missing totals.
- Keep short-output behavior group-aware:
  - when multiple groups exist, print by group
  - when only `default` exists, avoid redundant group header noise

Experimental integration hook (staged):

- Add `--experimental-with-catalog` option to:
  - default invocation,
  - `check`,
  - `update`/`snapshot`.
- With this option enabled:
  - check flow runs regular snapshot check + catalog check
  - update flow runs regular snapshot update + catalog update
- Add config-level opt-in:
  - `experimentalWithCatalog: true`
  - this enables the same catalog hook behavior without requiring command-line flags

Known staged limitation:

- Discovery is based on resolvable installed packages and exposed plugin `rules` exports; it is not a perfect universal registry of all theoretically installable rules.

Validation status for this staged enhancement:

- API/CLI automated tests cover catalog command behavior and baseline check/update flows.
- OSS compatibility matrix validates catalog-enabled zero-config flow and post-init equivalence on:
  - `vercel/next.js` (Linux + Windows)
  - `nrwl/nx`
  - `facebook/react-native`
  - `aws/aws-sdk-js`
  - `oss-serverless/serverless`
