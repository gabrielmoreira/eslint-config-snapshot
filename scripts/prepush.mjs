import { execSync, spawnSync } from 'node:child_process'
import path from 'node:path'

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function tryCmd(cmd) {
  try { return sh(cmd) } catch { return '' }
}

const upstreamBase = tryCmd('git merge-base --fork-point @{u} HEAD')
const originMainBase = tryCmd('git merge-base origin/main HEAD')
const base = upstreamBase || originMainBase || 'HEAD~1'
const nodeBinDir = path.dirname(process.execPath)
const pnpmCmd = process.platform === 'win32' ? path.join(nodeBinDir, 'pnpm.cmd') : path.join(nodeBinDir, 'pnpm')

const r = spawnSync(pnpmCmd, ['nx', 'affected', '-t', 'test', '--base', base, '--head', 'HEAD'], {
  stdio: 'inherit',
})

process.exit(r.status ?? 1)
