import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { sampleWorkspaceFiles } from '../src/index.js'

const tmp = path.join(os.tmpdir(), `snapshotter-sampling-${Date.now()}`)

afterAll(async () => {
  await import('node:fs/promises').then((fs) => fs.rm(tmp, { recursive: true, force: true }))
})

describe('sampleWorkspaceFiles', () => {
  it('returns deterministic sorted sample', async () => {
    await mkdir(path.join(tmp, 'src'), { recursive: true })
    await writeFile(path.join(tmp, 'src', 'b.ts'), '')
    await writeFile(path.join(tmp, 'src', 'a.ts'), '')

    const result = await sampleWorkspaceFiles(tmp, {
      maxFilesPerWorkspace: 8,
      includeGlobs: ['**/*.ts'],
      excludeGlobs: [],
      hintGlobs: []
    })

    expect(result).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('selects uniformly distributed files when candidates exceed max', async () => {
    await mkdir(path.join(tmp, 'many'), { recursive: true })
    for (let index = 0; index < 20; index += 1) {
      const name = `file-${String(index).padStart(2, '0')}.ts`
      await writeFile(path.join(tmp, 'many', name), '')
    }

    const result = await sampleWorkspaceFiles(tmp, {
      maxFilesPerWorkspace: 8,
      includeGlobs: ['many/**/*.ts'],
      excludeGlobs: [],
      hintGlobs: []
    })

    expect(result).toEqual([
      'many/file-00.ts',
      'many/file-01.ts',
      'many/file-04.ts',
      'many/file-07.ts',
      'many/file-10.ts',
      'many/file-13.ts',
      'many/file-16.ts',
      'many/file-19.ts'
    ])
  })

  it('prefers token-diverse hinted files before fallback spacing', async () => {
    await mkdir(path.join(tmp, 'tokens'), { recursive: true })
    const files = [
      'tokens/auth.service.ts',
      'tokens/billing.service.ts',
      'tokens/catalog.service.ts',
      'tokens/auth.controller.ts',
      'tokens/billing.controller.ts',
      'tokens/catalog.controller.ts',
      'tokens/shared.util.ts',
      'tokens/shared.helper.ts',
      'tokens/shared.format.ts',
      'tokens/shared.view.ts'
    ]

    for (const file of files) {
      await writeFile(path.join(tmp, file), '')
    }

    const result = await sampleWorkspaceFiles(tmp, {
      maxFilesPerWorkspace: 6,
      includeGlobs: ['tokens/**/*.ts'],
      excludeGlobs: [],
      hintGlobs: ['tokens/**/*.service.ts']
    })

    expect(result).toEqual([
      'tokens/auth.controller.ts',
      'tokens/auth.service.ts',
      'tokens/billing.service.ts',
      'tokens/catalog.service.ts',
      'tokens/shared.format.ts',
      'tokens/shared.view.ts'
    ])
  })
})
