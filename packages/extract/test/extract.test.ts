import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { extractRulesFromPrintConfig, resolveEslintBinForWorkspace } from '../src/index.js'

const workspace = path.join(os.tmpdir(), `snapshotter-extract-${Date.now()}`)

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('extract', () => {
  it('resolves eslint workspace-locally and normalizes rules', async () => {
    await mkdir(path.join(workspace, 'node_modules/eslint/bin'), { recursive: true })
    await mkdir(path.join(workspace, 'src'), { recursive: true })

    await writeFile(
      path.join(workspace, 'node_modules/eslint/package.json'),
      JSON.stringify({ name: 'eslint', version: '0.0.0' }, null, 2)
    )

    await writeFile(
      path.join(workspace, 'node_modules/eslint/bin/eslint.js'),
      "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: [2, 'always'] } }))"
    )

    const fileAbs = path.join(workspace, 'src/index.ts')
    await writeFile(fileAbs, 'export {}\n')

    const resolved = resolveEslintBinForWorkspace(workspace)
    expect(resolved.replace(/\\/g, '/').includes('eslint/bin/eslint')).toBe(true)

    const rules = extractRulesFromPrintConfig(workspace, fileAbs)
    expect(Object.fromEntries(rules.entries())).toEqual({
      'no-console': ['warn'],
      eqeqeq: ['error', 'always']
    })
  })
})
