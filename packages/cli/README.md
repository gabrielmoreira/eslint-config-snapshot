# @eslint-config-snapshot/cli

Deterministic ESLint config drift checker for workspaces.

`@eslint-config-snapshot/cli` snapshots effective ESLint rule state and reports drift after dependency or config changes.

## Install

```bash
npm i -D @eslint-config-snapshot/cli
```

Or run without install:

```bash
npx @eslint-config-snapshot/cli@latest --update
```

## Quick Start

Create baseline:

```bash
eslint-config-snapshot --update
```

Check drift:

```bash
eslint-config-snapshot
```

## Commands

- `check`
- `update`
- `print`
- `init`

Compatibility aliases:

- `snapshot` => `update`
- `compare` => `check --format diff`
- `status` => `check --format status`
- `what-changed` => `check --format summary`

## Notes

- Node.js `>=20` required.
- If no config is found, built-in defaults are used.
- Snapshots are stored under `.eslint-config-snapshot/`.

## Related Packages

- API engine: [`@eslint-config-snapshot/api`](https://www.npmjs.com/package/@eslint-config-snapshot/api)

## More Docs

- Project overview and full guides: [root README](https://github.com/gabrielmoreira/eslint-config-snapshot#readme)
