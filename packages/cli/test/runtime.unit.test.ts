import { describe, expect, it } from 'vitest'

import { compareSnapshotMaps } from '../src/runtime.js'

describe('runtime helpers', () => {
  it('detects changed groups deterministically', () => {
    const before = new Map([
      [
        'default',
        {
          formatVersion: 1 as const,
          groupId: 'default',
          workspaces: ['packages/a'],
          rules: { a: ['error'] as const }
        }
      ]
    ])

    const after = new Map([
      [
        'default',
        {
          formatVersion: 1 as const,
          groupId: 'default',
          workspaces: ['packages/a'],
          rules: { a: ['off'] as const }
        }
      ]
    ])

    const changes = compareSnapshotMaps(before, after)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.groupId).toBe('default')
    expect(changes[0]?.diff.severityChanges).toHaveLength(1)
  })
})
