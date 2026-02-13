import { spawnSync } from 'node:child_process'

const messageFile = process.argv[2]
const args = ['commitlint']
if (messageFile) {
  args.push('--edit', messageFile)
}

const result = spawnSync('pnpm', args, { stdio: 'inherit' })
process.exit(result.status ?? 1)
