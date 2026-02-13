import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/index.js'

const fixtureRoot = path.resolve('test/fixtures/repo')

afterAll(async () => {
  await rm(path.join(fixtureRoot, '.eslint-config-snapshots'), { recursive: true, force: true })
})

beforeEach(async () => {
  await rm(path.join(fixtureRoot, '.eslint-config-snapshots'), { recursive: true, force: true })

  await writeFile(
    path.join(fixtureRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
    "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: [2, 'always'] } }))\n"
  )
})

describe('cli integration', () => {
  it('snapshot writes deterministic snapshot files', async () => {
    const code = await runCli('snapshot', fixtureRoot)
    expect(code).toBe(0)

    const snapshotRaw = await readFile(path.join(fixtureRoot, '.eslint-config-snapshots/default.json'), 'utf8')
    const snapshot = JSON.parse(snapshotRaw)

    expect(snapshot).toEqual({
      formatVersion: 1,
      groupId: 'default',
      workspaces: ['packages/ws-a', 'packages/ws-b'],
      rules: {
        eqeqeq: ['error', 'always'],
        'no-console': ['error'],
        'no-debugger': ['off']
      }
    })

    expect(snapshotRaw.endsWith('\n')).toBe(true)
    expect(snapshotRaw.includes('src/index.ts')).toBe(false)
  })

  it('compare returns non-zero when snapshots changed', async () => {
    expect(await runCli('snapshot', fixtureRoot)).toBe(0)

    await writeFile(
      path.join(fixtureRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
      "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: 0 } }))\n"
    )

    const code = await runCli('compare', fixtureRoot)
    expect(code).toBe(1)
  })

  it('status is minimal and exits 0 when clean', async () => {
    await runCli('snapshot', fixtureRoot)

    const writeSpy = vi.spyOn(process.stdout, 'write')
    const code = await runCli('status', fixtureRoot)
    expect(code).toBe(0)
    expect(writeSpy).toHaveBeenCalledWith('clean\n')
  })

  it('print emits aggregated rules and exits 0', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write')
    const code = await runCli('print', fixtureRoot)
    expect(code).toBe(0)
    expect(writeSpy).toHaveBeenCalled()
  })

  it('init creates scaffold config', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshotter-init-'))
    const code = await runCli('init', tmp)
    expect(code).toBe(0)

    const content = await readFile(path.join(tmp, 'eslint-config-snapshotter.config.mjs'), 'utf8')
    expect(content).toContain("workspaceInput: { mode: 'discover' }")

    await rm(tmp, { recursive: true, force: true })
  })
})
