# @eslint-config-snapshot/api

Core API for deterministic ESLint config snapshot extraction, grouping, diffing, and persistence.

This package powers the CLI and can be used directly for custom tooling.

## Install

```bash
npm i @eslint-config-snapshot/api
```

## Usage

```ts
import { compareSnapshots, computeSnapshots } from "@eslint-config-snapshot/api"

const current = await computeSnapshots({
  rootDir: process.cwd(),
})

const diff = compareSnapshots(previous, current)
```

See exported APIs in `dist/index.d.ts` for the complete surface.

## Notes

- Node.js `>=20` required.
- Output is deterministic and excludes volatile metadata.
- ESLint extraction is workspace-scoped.

## Related Packages

- End-user CLI: [`@eslint-config-snapshot/cli`](https://www.npmjs.com/package/@eslint-config-snapshot/cli)

## More Docs

- Project overview and behavior contract: [root README](https://github.com/gabrielmoreira/eslint-config-snapshot#readme)
