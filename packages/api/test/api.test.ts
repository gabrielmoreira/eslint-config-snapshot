import { describe, expect, it } from 'vitest'

import { normalizePath, sortUnique } from '../src/index.js'

describe('api', () => {
  it('re-exports core utils', () => {
    expect(normalizePath('a\\b/')).toBe('a/b')
    expect(sortUnique(['b', 'a'])).toEqual(['a', 'b'])
  })
})
