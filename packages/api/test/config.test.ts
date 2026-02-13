import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG, loadConfig } from '../src/index.js'

let tmp = ''

afterEach(async () => {
  if (tmp) {
    await rm(tmp, { recursive: true, force: true })
    tmp = ''
  }
})

describe('loadConfig', () => {
  it('includes markdown files in default sampling globs', () => {
    expect(DEFAULT_CONFIG.sampling.includeGlobs).toContain('**/*.{js,jsx,ts,tsx,cjs,mjs,md,mdx,json,css}')
  })

  it('returns defaults when no config is found', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-config-'))
    const config = await loadConfig(tmp)
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('uses deterministic search order and picks the first matching file', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-config-'))
    await writeFile(path.join(tmp, '.eslint-config-snapshot.cjs'), 'module.exports = { sampling: { maxFilesPerWorkspace: 2 } }\n')
    await writeFile(path.join(tmp, 'eslint-config-snapshot.config.mjs'), 'export default { sampling: { maxFilesPerWorkspace: 9 } }\n')

    const config = await loadConfig(tmp)
    expect(config.sampling.maxFilesPerWorkspace).toBe(2)
  })

  it('loads config from package.json field', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-config-'))
    await writeFile(
      path.join(tmp, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture',
          private: true,
          'eslint-config-snapshot': {
            workspaceInput: { mode: 'manual', workspaces: ['packages/z', 'packages/a'] },
            grouping: { mode: 'standalone' },
            sampling: { maxFilesPerWorkspace: 5, includeGlobs: ['**/*.tsx'] }
          }
        },
        null,
        2
      )
    )

    const config = await loadConfig(tmp)
    expect(config.workspaceInput).toEqual({ mode: 'manual', workspaces: ['packages/z', 'packages/a'] })
    expect(config.grouping.mode).toBe('standalone')
    expect(config.sampling.maxFilesPerWorkspace).toBe(5)
    expect(config.sampling.includeGlobs).toEqual(['**/*.tsx'])
    expect(config.sampling.excludeGlobs).toEqual(DEFAULT_CONFIG.sampling.excludeGlobs)
  })

  it('loads config from rc json file', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-config-'))
    await writeFile(path.join(tmp, '.eslint-config-snapshotrc.json'), JSON.stringify({ sampling: { maxFilesPerWorkspace: 7 } }))

    const config = await loadConfig(tmp)
    expect(config.sampling.maxFilesPerWorkspace).toBe(7)
  })

  it('executes function exports', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-config-'))
    await writeFile(
      path.join(tmp, '.eslint-config-snapshot.js'),
      'export default () => ({ grouping: { mode: "standalone" }, sampling: { includeGlobs: ["src/**"] } })\n'
    )

    const config = await loadConfig(tmp)
    expect(config.grouping.mode).toBe('standalone')
    expect(config.sampling.includeGlobs).toEqual(['src/**'])
  })

  it('executes async function exports', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-config-'))
    await writeFile(
      path.join(tmp, '.eslint-config-snapshot.mjs'),
      'export default async () => ({ sampling: { maxFilesPerWorkspace: 3, includeGlobs: ["src/**"] } })\n'
    )

    const config = await loadConfig(tmp)
    expect(config.sampling.maxFilesPerWorkspace).toBe(3)
    expect(config.sampling.includeGlobs).toEqual(['src/**'])
  })

  it('throws deterministic error when config export is invalid', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-config-'))
    await writeFile(path.join(tmp, '.eslint-config-snapshot.cjs'), 'module.exports = 42\n')

    await expect(loadConfig(tmp)).rejects.toThrow(
      'Invalid config export: expected object, function, or async function returning an object'
    )
  })
})
