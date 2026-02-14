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
- Discover available rules per workspace using workspace-scoped module resolution:
  - ESLint core builtin rules (`eslint/use-at-your-own-risk`),
  - plugin packages found through workspace/root `node_modules` scan and dependency metadata.
- Aggregate catalog data by resolved snapshot group.
- Keep deterministic ordering for all catalog outputs.

Known staged limitation:

- Discovery is based on resolvable installed packages and exposed plugin `rules` exports; it is not a perfect universal registry of all theoretically installable rules.
