import { describe, expect, it } from 'vitest'

import { buildRecommendedConfigFromAssignments } from '../src/init.js'

describe('init module', () => {
  it('returns empty config when no explicit assignments are provided', () => {
    const config = buildRecommendedConfigFromAssignments(['packages/a', 'packages/b'], new Map())
    expect(config).toEqual({})
  })

  it('builds static groups followed by dynamic catch-all', () => {
    const config = buildRecommendedConfigFromAssignments(
      ['packages/a', 'packages/b', 'packages/c'],
      new Map([
        ['packages/b', 2],
        ['packages/c', 1]
      ])
    )

    expect(config).toEqual({
      grouping: {
        mode: 'match',
        groups: [
          { name: 'group-1', match: ['packages/c'] },
          { name: 'group-2', match: ['packages/b'] },
          { name: 'default', match: ['**/*'] }
        ]
      }
    })
  })
})
