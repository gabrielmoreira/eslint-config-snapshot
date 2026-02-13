import { describe, expect, it } from 'vitest'

import { diffSnapshots, hasDiff } from '../src/index.js'

describe('diffSnapshots', () => {
  it('detects rule and workspace changes', () => {
    const before = {
      formatVersion: 1 as const,
      groupId: 'default',
      workspaces: ['packages/a'],
      rules: {
        a: ['warn'] as ['warn'],
        b: ['error', { allow: false }] as ['error', { allow: boolean }]
      }
    }

    const after = {
      formatVersion: 1 as const,
      groupId: 'default',
      workspaces: ['packages/b'],
      rules: {
        a: ['error'] as ['error'],
        c: ['warn'] as ['warn']
      }
    }

    const diff = diffSnapshots(before, after)
    expect(diff.introducedRules).toEqual(['c'])
    expect(diff.removedRules).toEqual(['b'])
    expect(diff.severityChanges).toEqual([{ rule: 'a', before: 'warn', after: 'error' }])
    expect(diff.workspaceMembershipChanges).toEqual({ added: ['packages/b'], removed: ['packages/a'] })
    expect(hasDiff(diff)).toBe(true)
  })
})
