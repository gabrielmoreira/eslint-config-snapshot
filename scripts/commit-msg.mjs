import { spawnSync } from 'node:child_process'
import process from 'node:process'

const messageFile = process.argv[2]
const args = ['commitlint']
if (messageFile) {
  args.push('--edit', messageFile)
}

const result = spawnSync('pnpm', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
process.exit(result.status ?? 1)
