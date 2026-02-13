import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { aggregateRules, buildSnapshot, writeSnapshotFile } from '../src/index.js'

let tmpDir = ''

afterAll(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true })
  }
})

describe('snapshot', () => {
  it('writes deterministic json', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'snapshotter-snapshot-'))

    const snapshot = buildSnapshot('default', ['packages/b', 'packages/a'], new Map([
      ['z-rule', ['warn']],
      ['a-rule', ['error', { b: 1, a: 2 }]]
    ]))

    const output = await writeSnapshotFile(tmpDir, snapshot)
    const content = await readFile(output, 'utf8')

    expect(content).toContain('"formatVersion": 1')
    expect(content.endsWith('\n')).toBe(true)
    expect(content.indexOf('"a-rule"')).toBeLessThan(content.indexOf('"z-rule"'))
  })

  it('aggregates by highest severity', () => {
    const result = aggregateRules([
      new Map([['no-console', ['warn'] as const]]),
      new Map([['no-console', ['error'] as const], ['eqeqeq', ['error', 'always'] as const]])
    ])

    expect(Object.fromEntries(result.entries())).toEqual({
      eqeqeq: ['error', 'always'],
      'no-console': ['error']
    })
  })

  it('uses options from highest severity when severities differ', () => {
    const result = aggregateRules([
      new Map([['no-unused-vars', ['warn', { args: 'none' }] as const]]),
      new Map([['no-unused-vars', ['error', { argsIgnorePattern: '^_' }] as const]])
    ])

    expect(Object.fromEntries(result.entries())).toEqual({
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    })
  })

  it('throws on conflicting options at same severity', () => {
    expect(() =>
      aggregateRules([
        new Map([['no-restricted-imports', ['error', { paths: ['a'] }] as const]]),
        new Map([['no-restricted-imports', ['error', { paths: ['b'] }] as const]])
      ])
    ).toThrow('Conflicting rule options for no-restricted-imports at severity error')
  })
})
