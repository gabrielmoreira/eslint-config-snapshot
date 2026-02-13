import { spawnSync } from 'node:child_process'
import path from 'node:path'

const nodeBinDir = path.dirname(process.execPath)
const pnpmCmd = process.platform === 'win32' ? path.join(nodeBinDir, 'pnpm.cmd') : path.join(nodeBinDir, 'pnpm')
const result = spawnSync(pnpmCmd, ['lint-staged'], { stdio: 'inherit' })
process.exit(result.status ?? 1)
