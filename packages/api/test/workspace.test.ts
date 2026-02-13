import { describe, expect, it } from 'vitest'

import { assignGroupsByMatch } from '../src/index.js'

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
