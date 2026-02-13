import { describe, expect, it } from 'vitest'

import { formatCommandDisplayLabel, formatDiff, summarizeSnapshots } from '../src/formatters.js'

describe('output helpers', () => {
  it('formats friendly command labels', () => {
    expect(formatCommandDisplayLabel('check')).toBe('Check drift against baseline (summary)')
    expect(formatCommandDisplayLabel('print:short')).toBe('Print aggregated rules (short view)')
    expect(formatCommandDisplayLabel('custom')).toBe('custom')
  })

  it('formats nested diff sections', () => {
    const formatted = formatDiff('default', {
      introducedRules: ['a'],
      removedRules: ['b'],
      severityChanges: [{ rule: 'c', before: 'error', after: 'off' }],
      optionChanges: [{ rule: 'd', before: { a: true }, after: { a: false } }],
      workspaceMembershipChanges: { added: ['packages/new'], removed: ['packages/old'] }
    })
    expect(formatted).toContain('group: default')
    expect(formatted).toContain('introduced rules:')
    expect(formatted).toContain('removed rules:')
    expect(formatted).toContain('severity changed:')
    expect(formatted).toContain('options changed:')
    expect(formatted).toContain('workspaces added:')
  })

  it('summarizes snapshot severities', () => {
    const summary = summarizeSnapshots(
      new Map([
        [
          'default',
          {
            groupId: 'default',
            workspaces: ['packages/a'],
            rules: {
              a: ['error'],
              b: ['warn'],
              c: ['off']
            }
          }
        ]
      ])
    )
    expect(summary).toEqual({ groups: 1, rules: 3, error: 1, warn: 1, off: 1 })
  })
})
