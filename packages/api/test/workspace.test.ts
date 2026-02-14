import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { assignGroupsByMatch, discoverWorkspaces } from '../src/index.js'

describe('assignGroupsByMatch', () => {
  it('assigns by first matching group and supports negatives', () => {
    const result = assignGroupsByMatch(['ops/a', 'packages/new', 'packages/legacy/x'], [
      { name: 'ops', match: ['ops/**'] },
      { name: 'modern', match: ['packages/**', '!packages/legacy/**'] },
      { name: 'default', match: ['**/*'] }
    ])

    expect(result).toEqual([
      { name: 'ops', workspaces: ['ops/a'] },
      { name: 'modern', workspaces: ['packages/new'] },
      { name: 'default', workspaces: ['packages/legacy/x'] }
    ])
  })

  it('throws deterministic unmatched error', () => {
    expect(() => assignGroupsByMatch(['packages/a'], [{ name: 'ops', match: ['ops/**'] }])).toThrow(
      'Unmatched workspaces: packages/a'
    )
  })
})

describe('discoverWorkspaces', () => {
  it('falls back to package.json workspaces when package manager metadata is unavailable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'snapshot-workspaces-'))
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture',
          private: true,
          workspaces: ['packages/*']
        },
        null,
        2
      )
    )
    await mkdir(path.join(root, 'packages/a'), { recursive: true })
    await mkdir(path.join(root, 'packages/b'), { recursive: true })
    await writeFile(path.join(root, 'packages/a/package.json'), JSON.stringify({ name: 'a', version: '1.0.0' }, null, 2))
    await writeFile(path.join(root, 'packages/b/package.json'), JSON.stringify({ name: 'b', version: '1.0.0' }, null, 2))

    try {
      const discovery = await discoverWorkspaces({ cwd: root })
      expect(discovery.rootAbs).toBe(root)
      expect(discovery.workspacesRel).toEqual(['packages/a', 'packages/b'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('falls back to current directory when workspace discovery cannot find matches', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'snapshot-workspaces-empty-'))
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] }, null, 2))

    try {
      const discovery = await discoverWorkspaces({ cwd: root })
      expect(discovery.rootAbs).toBe(root)
      expect(discovery.workspacesRel).toEqual(['.'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
