import { spawnSync } from 'node:child_process'
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const templateRoot = path.resolve('test/fixtures/npm-isolated-template')
const cliDist = path.resolve('dist/index.js')

let fixtureRoot = ''

function npmCmd(): string {
  const base = path.dirname(process.execPath)
  return process.platform === 'win32' ? path.join(base, 'npm.cmd') : path.join(base, 'npm')
}

function run(command: string, args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const proc = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
    shell: process.platform === 'win32'
  })

  return {
    status: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: `${proc.stderr ?? ''}${proc.error ? `\n${String(proc.error)}` : ''}`
  }
}

describe('cli npm-isolated integration', () => {
  beforeAll(async () => {
    const tmpBase = await mkdtemp(path.join(os.tmpdir(), 'snapshot-npm-it-'))
    fixtureRoot = path.join(tmpBase, 'repo')
    await cp(templateRoot, fixtureRoot, { recursive: true })

    const wsA = path.join(fixtureRoot, 'packages/ws-a')
    const wsB = path.join(fixtureRoot, 'packages/ws-b')

    const installA = run(npmCmd(), ['install', '--no-audit', '--no-fund', '--workspaces=false'], wsA)
    expect(installA.status, `${installA.stdout}\n${installA.stderr}`).toBe(0)
    await access(path.join(wsA, 'node_modules/eslint/package.json'))

    const installB = run(npmCmd(), ['install', '--no-audit', '--no-fund', '--workspaces=false'], wsB)
    expect(installB.status, `${installB.stdout}\n${installB.stderr}`).toBe(0)
    await access(path.join(wsB, 'node_modules/eslint/package.json'))
  }, 180000)

  afterAll(async () => {
    if (fixtureRoot) {
      await rm(path.dirname(fixtureRoot), { recursive: true, force: true })
    }
  })

  it('runs commands in isolated subprocesses with workspace-local npm eslint', async () => {
    const snapshot = run(process.execPath, [cliDist, 'snapshot'], fixtureRoot)
    expect(snapshot.status, snapshot.stderr).toBe(0)

    const snapshotRaw = await readFile(path.join(fixtureRoot, '.eslint-config-snapshot/default.json'), 'utf8')
    const parsed = JSON.parse(snapshotRaw)
    expect(parsed).toEqual({
      formatVersion: 1,
      groupId: 'default',
      workspaces: ['packages/ws-a', 'packages/ws-b'],
      rules: {
        eqeqeq: ['error', 'always'],
        'no-console': ['error'],
        'no-debugger': ['off']
      }
    })

    const compareClean = run(process.execPath, [cliDist, 'compare'], fixtureRoot)
    expect(compareClean.status, compareClean.stdout + compareClean.stderr).toBe(0)

    const statusClean = run(process.execPath, [cliDist, 'status'], fixtureRoot)
    expect(statusClean.status).toBe(0)
    expect(statusClean.stdout).toContain('clean')

    const printOut = run(process.execPath, [cliDist, 'print'], fixtureRoot)
    expect(printOut.status, printOut.stderr).toBe(0)
    expect(printOut.stdout).toContain('"groupId": "default"')

    await writeFile(
      path.join(fixtureRoot, 'packages/ws-a/.eslintrc.cjs'),
      "module.exports = { root: true, rules: { 'no-console': 'warn', eqeqeq: 'off' } }\n"
    )

    const compareChanged = run(process.execPath, [cliDist, 'compare'], fixtureRoot)
    expect(compareChanged.status).toBe(1)
  }, 180000)
})
