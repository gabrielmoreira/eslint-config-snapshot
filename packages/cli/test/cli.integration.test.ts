import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildRecommendedConfigFromAssignments, runCli } from '../src/index.js'

const fixtureTemplateRoot = path.resolve('test/fixtures/repo')
let tmpDir = ''
let fixtureRoot = ''
let previousNoProgress = ''

beforeEach(async () => {
  previousNoProgress = process.env.ESLINT_CONFIG_SNAPSHOT_NO_PROGRESS ?? ''
  process.env.ESLINT_CONFIG_SNAPSHOT_NO_PROGRESS = '1'
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
  if (previousNoProgress === '') {
    delete process.env.ESLINT_CONFIG_SNAPSHOT_NO_PROGRESS
  } else {
    process.env.ESLINT_CONFIG_SNAPSHOT_NO_PROGRESS = previousNoProgress
  }
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true })
    tmpDir = ''
    fixtureRoot = ''
  }
})

describe.sequential('cli integration', () => {
  it('builds recommended config as dynamic-only when no static overrides are selected', () => {
    const config = buildRecommendedConfigFromAssignments(['packages/ws-a', 'packages/ws-b'], new Map())
    expect(config).toEqual({})
  })

  it('builds recommended config with static overrides plus dynamic catch-all', () => {
    const config = buildRecommendedConfigFromAssignments(['packages/ws-a', 'packages/ws-b'], new Map([['packages/ws-b', 2]]))
    expect(config).toEqual({
      grouping: {
        mode: 'match',
        groups: [
          { name: 'group-2', match: ['packages/ws-b'] },
          { name: 'default', match: ['**/*'] }
        ]
      }
    })
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
        'no-console': [['error'], ['warn']],
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

  it('update in zero-config mode skips workspaces with unrecoverable eslint extraction failures', async () => {
    await rm(path.join(fixtureRoot, 'eslint-config-snapshot.config.mjs'), { force: true })
    const packageJsonPath = path.join(fixtureRoot, 'package.json')
    const packageJsonRaw = await readFile(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(packageJsonRaw) as Record<string, unknown>
    delete packageJson['eslint-config-snapshot']
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

    await writeFile(
      path.join(fixtureRoot, 'packages/ws-b/node_modules/eslint/bin/eslint.js'),
      "console.error('Failed to load config \"next/core-web-vitals\" to extend from.'); process.exit(1)\n"
    )

    const writeSpy = vi.spyOn(process.stdout, 'write')
    const code = await runCli('update', fixtureRoot)
    expect(code).toBe(0)
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('workspace(s) were skipped because ESLint auto-discovery could not extract an effective config')
    )
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped workspaces: packages/ws-b'))
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('excludeGlobs'))
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('packages/ws-b/**'))

    const snapshotRaw = await readFile(path.join(fixtureRoot, '.eslint-config-snapshot/default.json'), 'utf8')
    const snapshot = JSON.parse(snapshotRaw)

    expect(snapshot).toEqual({
      formatVersion: 1,
      groupId: 'default',
      workspaces: ['packages/ws-a'],
      rules: {
        eqeqeq: ['error', 'always'],
        'no-console': ['warn']
      }
    })
  })

  it('update treats explicit empty package config as zero-config tolerant mode', async () => {
    await rm(path.join(fixtureRoot, 'eslint-config-snapshot.config.mjs'), { force: true })
    const packageJsonPath = path.join(fixtureRoot, 'package.json')
    const packageJsonRaw = await readFile(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(packageJsonRaw) as Record<string, unknown>
    packageJson['eslint-config-snapshot'] = {}
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

    await writeFile(
      path.join(fixtureRoot, 'packages/ws-b/node_modules/eslint/bin/eslint.js'),
      "console.error('Failed to load config \"next/core-web-vitals\" to extend from.'); process.exit(1)\n"
    )

    const code = await runCli('update', fixtureRoot)
    expect(code).toBe(0)

    const snapshotRaw = await readFile(path.join(fixtureRoot, '.eslint-config-snapshot/default.json'), 'utf8')
    const snapshot = JSON.parse(snapshotRaw)

    expect(snapshot).toEqual({
      formatVersion: 1,
      groupId: 'default',
      workspaces: ['packages/ws-a'],
      rules: {
        eqeqeq: ['error', 'always'],
        'no-console': ['warn']
      }
    })
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
no-console: [["error"],["warn"]]
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
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('baseline was successfully created'))
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
    excludeGlobs: ['**/node_modules/**']
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
    excludeGlobs: ['**/node_modules/**']
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
