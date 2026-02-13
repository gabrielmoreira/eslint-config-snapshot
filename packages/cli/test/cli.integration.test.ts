import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseInitPresetChoice, parseInitTargetChoice, runCli } from '../src/index.js'

const fixtureTemplateRoot = path.resolve('test/fixtures/repo')
let tmpDir = ''
let fixtureRoot = ''

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'snapshot-cli-integration-'))
  fixtureRoot = path.join(tmpDir, 'repo')
  await cp(fixtureTemplateRoot, fixtureRoot, { recursive: true })

  await mkdir(path.join(fixtureRoot, 'packages/ws-a/node_modules/eslint/bin'), { recursive: true })
  await mkdir(path.join(fixtureRoot, 'packages/ws-b/node_modules/eslint/bin'), { recursive: true })

  await writeFile(
    path.join(fixtureRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
    "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: [2, 'always'] } }))\n"
  )
  await writeFile(
    path.join(fixtureRoot, 'packages/ws-a/node_modules/eslint/package.json'),
    JSON.stringify({ name: 'eslint', version: '9.0.0' }, null, 2)
  )

  await writeFile(
    path.join(fixtureRoot, 'packages/ws-b/node_modules/eslint/bin/eslint.js'),
    "console.log(JSON.stringify({ rules: { 'no-console': 2, 'no-debugger': 0 } }))\n"
  )
  await writeFile(
    path.join(fixtureRoot, 'packages/ws-b/node_modules/eslint/package.json'),
    JSON.stringify({ name: 'eslint', version: '9.0.0' }, null, 2)
  )
})

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true })
    tmpDir = ''
    fixtureRoot = ''
  }
})

describe.sequential('cli integration', () => {
  it('parses init interactive target choices from numeric and aliases', () => {
    expect(parseInitTargetChoice('')).toBe('package-json')
    expect(parseInitTargetChoice('1')).toBe('package-json')
    expect(parseInitTargetChoice('package')).toBe('package-json')
    expect(parseInitTargetChoice('pkg')).toBe('package-json')
    expect(parseInitTargetChoice('2')).toBe('file')
    expect(parseInitTargetChoice('file')).toBe('file')
    expect(parseInitTargetChoice('invalid')).toBeUndefined()
  })

  it('parses init interactive preset choices from numeric and aliases', () => {
    expect(parseInitPresetChoice('')).toBe('recommended')
    expect(parseInitPresetChoice('1')).toBe('recommended')
    expect(parseInitPresetChoice('rec')).toBe('recommended')
    expect(parseInitPresetChoice('2')).toBe('minimal')
    expect(parseInitPresetChoice('min')).toBe('minimal')
    expect(parseInitPresetChoice('3')).toBe('full')
    expect(parseInitPresetChoice('full')).toBe('full')
    expect(parseInitPresetChoice('invalid')).toBeUndefined()
  })

  it('snapshot writes deterministic snapshot files', async () => {
    const code = await runCli('snapshot', fixtureRoot)
    expect(code).toBe(0)

    const snapshotRaw = await readFile(path.join(fixtureRoot, '.eslint-config-snapshot/default.json'), 'utf8')
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

  it('print --short emits compact human-readable output', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write')
    const code = await runCli('print', fixtureRoot, ['--short'])
    expect(code).toBe(0)
    expect(writeSpy).toHaveBeenCalledWith(
      `group: default
workspaces (2): packages/ws-a, packages/ws-b
rules (3): error 2, warn 0, off 1
eqeqeq: error "always"
no-console: error
no-debugger: off
`
    )
  })

  it('init creates scaffold config file when target=file', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-init-'))
    const code = await runCli('init', tmp, ['--yes', '--target', 'file', '--preset', 'full'])
    expect(code).toBe(0)

    const content = await readFile(path.join(tmp, 'eslint-config-snapshot.config.mjs'), 'utf8')
    expect(content).toContain('"workspaceInput"')
    expect(content).toContain('"grouping"')
    expect(content).toContain('"sampling"')

    await rm(tmp, { recursive: true, force: true })
  })

  it('config prints effective evaluated config and exits 0', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write')
    const code = await runCli('config', fixtureRoot)
    expect(code).toBe(0)
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"workspaceInput"'))
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"workspaces"'))
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"groups"'))
  })

  it('init writes minimal config to package.json when target=package-json', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-init-pkg-'))
    await writeFile(path.join(tmp, 'package.json'), JSON.stringify({ name: 'fixture', private: true }, null, 2))

    const code = await runCli('init', tmp, ['--yes', '--target', 'package-json', '--preset', 'minimal'])
    expect(code).toBe(0)

    const packageJsonRaw = await readFile(path.join(tmp, 'package.json'), 'utf8')
    const parsed = JSON.parse(packageJsonRaw) as {
      'eslint-config-snapshot'?: Record<string, unknown>
    }
    expect(parsed['eslint-config-snapshot']).toEqual({})

    await rm(tmp, { recursive: true, force: true })
  })

  it('help prints usage and exits 0', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write')
    const code = await runCli('--help', fixtureRoot)
    expect(code).toBe(0)
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
  })

  it('runs update mode without command', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write')
    const code = await runCli(undefined, fixtureRoot, ['--update'])
    expect(code).toBe(0)
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Baseline updated:'))
  })

  it('supports canonical check and update commands', async () => {
    expect(await runCli('update', fixtureRoot)).toBe(0)
    expect(await runCli('check', fixtureRoot)).toBe(0)
  })

  it('supports ordered multi-group matching with first match wins', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-cli-grouped-'))
    await cp(fixtureRoot, tmp, { recursive: true })

    await writeFile(
      path.join(tmp, 'eslint-config-snapshot.config.mjs'),
      `export default {
  workspaceInput: { mode: 'manual', workspaces: ['packages/ws-a', 'packages/ws-b'] },
  grouping: {
    mode: 'match',
    groups: [
      { name: 'modern', match: ['packages/**', '!packages/ws-b'] },
      { name: 'legacy', match: ['packages/ws-b'] }
    ]
  },
  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['**/*.ts'],
    excludeGlobs: ['**/node_modules/**'],
    hintGlobs: []
  }
}
`
    )

    const code = await runCli('snapshot', tmp)
    expect(code).toBe(0)

    const modern = JSON.parse(await readFile(path.join(tmp, '.eslint-config-snapshot/modern.json'), 'utf8'))
    const legacy = JSON.parse(await readFile(path.join(tmp, '.eslint-config-snapshot/legacy.json'), 'utf8'))

    expect(modern.workspaces).toEqual(['packages/ws-a'])
    expect(modern.rules).toEqual({
      eqeqeq: ['error', 'always'],
      'no-console': ['warn']
    })

    expect(legacy.workspaces).toEqual(['packages/ws-b'])
    expect(legacy.rules).toEqual({
      'no-console': ['error'],
      'no-debugger': ['off']
    })

    await rm(tmp, { recursive: true, force: true })
  })

  it('supports standalone mode with workspace path group ids', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-cli-standalone-'))
    await cp(fixtureRoot, tmp, { recursive: true })

    await writeFile(
      path.join(tmp, 'eslint-config-snapshot.config.mjs'),
      `export default {
  workspaceInput: { mode: 'manual', workspaces: ['packages/ws-a', 'packages/ws-b'] },
  grouping: { mode: 'standalone' },
  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['**/*.ts'],
    excludeGlobs: ['**/node_modules/**'],
    hintGlobs: []
  }
}
`
    )

    const snapshotCode = await runCli('snapshot', tmp)
    expect(snapshotCode).toBe(0)

    const wsAPath = path.join(tmp, '.eslint-config-snapshot/packages/ws-a.json')
    const wsBPath = path.join(tmp, '.eslint-config-snapshot/packages/ws-b.json')
    expect(JSON.parse(await readFile(wsAPath, 'utf8')).groupId).toBe('packages/ws-a')
    expect(JSON.parse(await readFile(wsBPath, 'utf8')).groupId).toBe('packages/ws-b')

    const compareCode = await runCli('compare', tmp)
    expect(compareCode).toBe(0)

    await rm(tmp, { recursive: true, force: true })
  })
})
