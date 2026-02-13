import { describe, expect, it } from 'vitest'

import { canonicalizeJson, normalizePath, normalizeSeverity, sortUnique } from '../src/index.js'

describe('core utils', () => {
  it('normalizes path separators and trailing slash', () => {
    expect(normalizePath('packages\\a\\')).toBe('packages/a')
  })

  it('sorts unique normalized list', () => {
    expect(sortUnique(['b', 'a/', 'a', 'b\\c'])).toEqual(['a', 'b', 'b/c'])
  })

  it('canonicalizes object keys recursively', () => {
    const input = { z: 1, a: { d: 1, c: 2 } }
    expect(canonicalizeJson(input)).toEqual({ a: { c: 2, d: 1 }, z: 1 })
  })

  it('normalizes numeric severity', () => {
    expect(normalizeSeverity(0)).toBe('off')
    expect(normalizeSeverity(1)).toBe('warn')
    expect(normalizeSeverity(2)).toBe('error')
  })
})
