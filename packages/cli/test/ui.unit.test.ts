import { describe, expect, it } from 'vitest'

import { resolveInvocationLabel } from '../src/terminal.js'

describe('terminal module', () => {
  it('resolves command labels deterministically', () => {
    expect(resolveInvocationLabel(['check'])).toBe('check')
    expect(resolveInvocationLabel(['--update'])).toBe('update')
    expect(resolveInvocationLabel(['--help'])).toBe('help')
    expect(resolveInvocationLabel([])).toBe('check')
  })
})
