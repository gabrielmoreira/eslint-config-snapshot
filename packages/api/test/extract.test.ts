import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { extractRulesForWorkspaceSamples, extractRulesFromPrintConfig, resolveEslintBinForWorkspace } from '../src/index.js'

const workspace = path.join(os.tmpdir(), `snapshot-extract-${Date.now()}`)

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
  await rm(`${workspace}-exports`, { recursive: true, force: true })
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
    expect(resolved.replaceAll('\\', '/').includes('eslint/bin/eslint')).toBe(true)

    const rules = extractRulesFromPrintConfig(workspace, fileAbs)
    expect(Object.fromEntries(rules.entries())).toEqual({
      'no-console': ['warn'],
      eqeqeq: ['error', 'always']
    })
  })

  it('falls back to eslint package entry when bin subpath is not directly resolvable', async () => {
    const exportedWorkspace = `${workspace}-exports`
    await mkdir(path.join(exportedWorkspace, 'node_modules/eslint/bin'), { recursive: true })
    await mkdir(path.join(exportedWorkspace, 'src'), { recursive: true })

    await writeFile(
      path.join(exportedWorkspace, 'node_modules/eslint/package.json'),
      JSON.stringify(
        {
          name: 'eslint',
          version: '0.0.0',
          type: 'commonjs',
          main: './index.js',
          exports: {
            '.': './index.js'
          },
          bin: {
            eslint: './bin/eslint.js'
          }
        },
        null,
        2
      )
    )

    await writeFile(path.join(exportedWorkspace, 'node_modules/eslint/index.js'), 'module.exports = {}')
    await writeFile(
      path.join(exportedWorkspace, 'node_modules/eslint/bin/eslint.js'),
      "console.log(JSON.stringify({ rules: { 'no-alert': 2 } }))"
    )

    const fileAbs = path.join(exportedWorkspace, 'src/index.ts')
    await writeFile(fileAbs, 'export {}\n')

    const resolved = resolveEslintBinForWorkspace(exportedWorkspace)
    expect(resolved.replaceAll('\\', '/').endsWith('/node_modules/eslint/bin/eslint.js')).toBe(true)

    const rules = extractRulesFromPrintConfig(exportedWorkspace, fileAbs)
    expect(Object.fromEntries(rules.entries())).toEqual({
      'no-alert': ['error']
    })
  })

  it('throws when eslint cannot be resolved from workspace', () => {
    const missingWorkspace = `${workspace}-missing`
    expect(() => resolveEslintBinForWorkspace(missingWorkspace)).toThrow(
      `Unable to resolve eslint from workspace: ${missingWorkspace}`
    )
  })

  it('throws when eslint print-config returns invalid JSON', async () => {
    const invalidWorkspace = `${workspace}-invalid-json`
    await mkdir(path.join(invalidWorkspace, 'node_modules/eslint/bin'), { recursive: true })
    await mkdir(path.join(invalidWorkspace, 'src'), { recursive: true })
    await writeFile(path.join(invalidWorkspace, 'node_modules/eslint/package.json'), JSON.stringify({ name: 'eslint', version: '0.0.0' }, null, 2))
    await writeFile(path.join(invalidWorkspace, 'node_modules/eslint/bin/eslint.js'), "console.log('not json')\n")

    const fileAbs = path.join(invalidWorkspace, 'src/index.ts')
    await writeFile(fileAbs, 'export {}\n')

    expect(() => extractRulesFromPrintConfig(invalidWorkspace, fileAbs)).toThrow(
      `Invalid JSON from eslint --print-config for ${fileAbs}`
    )
  })

  it('throws when eslint print-config returns undefined output', async () => {
    const undefinedWorkspace = `${workspace}-undefined`
    await mkdir(path.join(undefinedWorkspace, 'node_modules/eslint/bin'), { recursive: true })
    await mkdir(path.join(undefinedWorkspace, 'src'), { recursive: true })
    await writeFile(path.join(undefinedWorkspace, 'node_modules/eslint/package.json'), JSON.stringify({ name: 'eslint', version: '0.0.0' }, null, 2))
    await writeFile(path.join(undefinedWorkspace, 'node_modules/eslint/bin/eslint.js'), "console.log('undefined')\n")

    const fileAbs = path.join(undefinedWorkspace, 'src/index.ts')
    await writeFile(fileAbs, 'export {}\n')

    expect(() => extractRulesFromPrintConfig(undefinedWorkspace, fileAbs)).toThrow(
      `Empty ESLint print-config output for ${fileAbs}`
    )
  })

  it('throws when eslint print-config exits non-zero', async () => {
    const failingWorkspace = `${workspace}-failing`
    await mkdir(path.join(failingWorkspace, 'node_modules/eslint/bin'), { recursive: true })
    await mkdir(path.join(failingWorkspace, 'src'), { recursive: true })
    await writeFile(path.join(failingWorkspace, 'node_modules/eslint/package.json'), JSON.stringify({ name: 'eslint', version: '0.0.0' }, null, 2))
    await writeFile(
      path.join(failingWorkspace, 'node_modules/eslint/bin/eslint.js'),
      "process.stderr.write('failure'); process.exit(2)\n"
    )

    const fileAbs = path.join(failingWorkspace, 'src/index.ts')
    await writeFile(fileAbs, 'export {}\n')

    expect(() => extractRulesFromPrintConfig(failingWorkspace, fileAbs)).toThrow(
      `Failed to run eslint --print-config for ${fileAbs}`
    )
  })

  it('extracts multiple sampled files in one workspace call', async () => {
    const multiWorkspace = `${workspace}-multi`
    await mkdir(path.join(multiWorkspace, 'node_modules/eslint/bin'), { recursive: true })
    await mkdir(path.join(multiWorkspace, 'src'), { recursive: true })
    await writeFile(path.join(multiWorkspace, 'node_modules/eslint/package.json'), JSON.stringify({ name: 'eslint', version: '0.0.0' }, null, 2))
    await writeFile(
      path.join(multiWorkspace, 'node_modules/eslint/bin/eslint.js'),
      "console.log(JSON.stringify({ rules: { 'no-console': 1 } }))\n"
    )

    const fileA = path.join(multiWorkspace, 'src/a.ts')
    const fileB = path.join(multiWorkspace, 'src/b.ts')
    await writeFile(fileA, 'export const a = 1\n')
    await writeFile(fileB, 'export const b = 1\n')

    const extracted = await extractRulesForWorkspaceSamples(multiWorkspace, [fileA, fileB])
    expect(extracted).toHaveLength(2)
    for (const entry of extracted) {
      expect(entry.error).toBeUndefined()
      expect(entry.rules ? Object.fromEntries(entry.rules.entries()) : {}).toEqual({
        'no-console': ['warn']
      })
    }
  })
})
