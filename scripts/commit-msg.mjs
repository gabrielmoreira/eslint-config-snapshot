import { spawnSync } from 'node:child_process'
import path from 'node:path'

const messageFile = process.argv[2]
const args = ['commitlint']
if (messageFile) {
  args.push('--edit', messageFile)
}

const nodeBinDir = path.dirname(process.execPath)
const pnpmCmd = process.platform === 'win32' ? path.join(nodeBinDir, 'pnpm.cmd') : path.join(nodeBinDir, 'pnpm')
const result = spawnSync(pnpmCmd, args, { stdio: 'inherit' })
process.exit(result.status ?? 1)
