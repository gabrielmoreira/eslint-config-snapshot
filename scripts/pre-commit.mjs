import { spawnSync } from 'node:child_process'
import process from 'node:process'

const result = spawnSync('pnpm', ['lint-staged'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
process.exit(result.status ?? 1)
