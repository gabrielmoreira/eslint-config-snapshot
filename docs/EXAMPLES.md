# Configuration Examples

This project prefers minimal initialization in `package.json`:

```json
{
  "eslint-config-snapshot": {}
}
```

You can still use `eslint-config-snapshot.config.mjs` when you prefer a dedicated file.

Use the examples below when you need explicit behavior.

## 1. Minimal (recommended default)

```js
// eslint-config-snapshot.config.mjs
export default {}
```

When to use:

- You want automatic workspace discovery.
- You want default grouping and sampling behavior.

## 2. Manual workspace input

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

## 3. Grouped workspaces with ordered matching

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

## 4. Standalone workspace grouping

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

## 5. Custom sampling policy

```js
// eslint-config-snapshot.config.mjs
export default {
  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['src/**/*.{ts,tsx,js,mjs,cjs}'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    hintGlobs: ['src/index.ts', 'src/main.ts']
  }
}
```

When to use:

- You need explicit sampling scope or stronger exclusions.
- You want deterministic hints to bias representative files.
