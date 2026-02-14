# Configuration Examples

See also: [`README.md`](../README.md), [`SPEC.md`](SPEC.md)

This project prefers minimal initialization in `package.json`:

```json
{
  "eslint-config-snapshot": {}
}
```

You can still use `eslint-config-snapshot.config.mjs` when you prefer a dedicated file.

Use the examples below when you need explicit behavior.

## Recommended Init Mental Model

- Default group `*` is a dynamic catch-all: every discovered workspace stays here unless explicitly overridden.
- In `init` recommended flow, select only exception workspaces, then assign them to static groups.
- If you select no exceptions, the generated config remains `{}` (fully dynamic).

## 1. Minimal in package.json (recommended)

```json
{
  "eslint-config-snapshot": {}
}
```

When to use:

- You want automatic workspace discovery.
- You want default grouping and sampling behavior.

## 2. Minimal file-based config

```js
// eslint-config-snapshot.config.mjs
export default {}
```

When to use:

- You prefer explicit config files over package.json fields.

## 3. Manual workspace input

```js
// eslint-config-snapshot.config.mjs
export default {
  workspaceInput: {
    mode: 'manual',
    workspaces: ['packages/api', 'packages/cli']
  }
}
```

When to use:

- You only want specific workspaces included.
- You want deterministic input independent from discovery.

## 4. Grouped workspaces with ordered matching

```js
// eslint-config-snapshot.config.mjs
export default {
  grouping: {
    mode: 'match',
    groups: [
      { name: 'apps', match: ['apps/**'] },
      { name: 'packages', match: ['packages/**', '!packages/legacy/**'] },
      { name: 'legacy', match: ['packages/legacy/**'] }
    ]
  }
}
```

When to use:

- You want first-match-wins grouping.
- You need negative patterns (`!`) to exclude subsets.

## 5. Standalone workspace grouping

```js
// eslint-config-snapshot.config.mjs
export default {
  grouping: {
    mode: 'standalone'
  }
}
```

When to use:

- You want one snapshot group per workspace.

## 6. Custom sampling policy

```js
// eslint-config-snapshot.config.mjs
export default {
  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['src/**/*.{ts,tsx,js,mjs,cjs}'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    tokenHints: ['controller', 'service', 'repository', 'route', 'view']
  }
}
```

When to use:

- You need explicit sampling scope or stronger exclusions.
- You want to bias representative file-role diversity through token priorities.

Note: `tokenHints` are naming/path tokens (not globs). They influence candidate priority; final sampling remains deterministic with regional fallback.

## 7. Enable experimental catalog hook in config

```js
// eslint-config-snapshot.config.mjs
export default {
  experimentalWithCatalog: true
}
```

When to use:

- You want catalog baseline checks to run automatically with your normal `check`/`update` flow.
- You do not want to pass `--experimental-with-catalog` every time.

Equivalent CLI-only mode:

```bash
eslint-config-snapshot check --experimental-with-catalog
eslint-config-snapshot update --experimental-with-catalog
```

## 8. Catalog baseline lifecycle

```bash
eslint-config-snapshot catalog-update
eslint-config-snapshot catalog-check
eslint-config-snapshot catalog --short --missing
```

When to use:

- You want explicit catalog baseline control separate from rule snapshot baseline.
- You want to track "available but not currently observed" rules over time.
