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
})
