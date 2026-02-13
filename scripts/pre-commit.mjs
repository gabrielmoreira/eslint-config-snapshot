import { spawnSync } from 'node:child_process'

const result = spawnSync('pnpm', ['lint-staged'], { stdio: 'inherit' })
process.exit(result.status ?? 1)
