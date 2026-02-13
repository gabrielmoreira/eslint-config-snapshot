import { spawnSync } from 'node:child_process'
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const templateRoot = path.resolve('test/fixtures/npm-isolated-template')
const cliDist = path.resolve('dist/index.js')

let fixtureRoot = ''

type RunResult = {
  status: number
  stdout: string
  stderr: string
  errorCode?: string
}

type ExecCandidate = {
  command: string
  argsPrefix: string[]
}

function getPnpmCandidates(): ExecCandidate[] {
  const candidates: ExecCandidate[] = []
  const execPath = process.env.npm_execpath
  if (execPath && execPath.toLowerCase().includes('pnpm')) {
    candidates.push({ command: process.execPath, argsPrefix: [execPath] })
  }

  candidates.push({ command: 'pnpm', argsPrefix: [] })
  if (process.platform === 'win32') {
    candidates.push({ command: 'pnpm.cmd', argsPrefix: [] })
  }

  return candidates
}

function run(command: string, args: string[], cwd: string): RunResult {
  const proc = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
    shell: process.platform === 'win32'
  })

  return {
    status: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: `${proc.stderr ?? ''}${proc.error ? `\n${String(proc.error)}` : ''}`,
    errorCode: proc.error?.code
  }
}

async function runWithRetry(
  command: string,
  args: string[],
  cwd: string,
  retries = 2
): Promise<RunResult> {
  let attempt = 0
  let lastResult = run(command, args, cwd)
  while (lastResult.status !== 0 && attempt < retries) {
    attempt += 1
    await delay(1000 * attempt)
    lastResult = run(command, args, cwd)
  }
  return lastResult
}

async function runPnpmWithRetry(args: string[], cwd: string, retries = 2): Promise<RunResult> {
  const candidates = getPnpmCandidates()
  let lastResult: RunResult = { status: 1, stdout: '', stderr: 'pnpm command not found' }

  for (const candidate of candidates) {
    const attempt = await runWithRetry(candidate.command, [...candidate.argsPrefix, ...args], cwd, retries)
    if (attempt.status === 0) {
      return attempt
    }

    lastResult = attempt
    if (attempt.errorCode !== 'ENOENT' && !attempt.stderr.includes('ENOENT')) {
      return attempt
    }
  }

  return lastResult
}

describe('cli pnpm-isolated integration', () => {
  beforeAll(async () => {
    const tmpBase = await mkdtemp(path.join(os.tmpdir(), 'snapshot-pnpm-it-'))
    fixtureRoot = path.join(tmpBase, 'repo')
    await cp(templateRoot, fixtureRoot, { recursive: true })

    const wsA = path.join(fixtureRoot, 'packages/ws-a')
    const wsB = path.join(fixtureRoot, 'packages/ws-b')

    const installA = await runPnpmWithRetry(['install', '--ignore-workspace', '--no-frozen-lockfile'], wsA)
    expect(installA.status, `${installA.stdout}\n${installA.stderr}`).toBe(0)
    await access(path.join(wsA, 'node_modules/eslint/package.json'))

    const installB = await runPnpmWithRetry(['install', '--ignore-workspace', '--no-frozen-lockfile'], wsB)
    expect(installB.status, `${installB.stdout}\n${installB.stderr}`).toBe(0)
    await access(path.join(wsB, 'node_modules/eslint/package.json'))
  }, 180000)

  afterAll(async () => {
    if (fixtureRoot) {
      await rm(path.dirname(fixtureRoot), { recursive: true, force: true })
    }
  })

  it('runs commands with workspace-local eslint installed by pnpm in isolated mode', async () => {
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

    await writeFile(
      path.join(fixtureRoot, 'packages/ws-a/.eslintrc.cjs'),
      "module.exports = { root: true, rules: { 'no-console': 'warn', eqeqeq: 'off' } }\n"
    )

    const compareChanged = run(process.execPath, [cliDist, 'compare'], fixtureRoot)
    expect(compareChanged.status).toBe(1)
  }, 180000)
})
