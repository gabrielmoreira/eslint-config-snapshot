import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { discoverWorkspaceRuleCatalog } from '../src/index.js'

let tmp = ''

afterEach(async () => {
  if (tmp) {
    await rm(tmp, { recursive: true, force: true })
    tmp = ''
  }
})

describe('catalog', () => {
  it('discovers core and plugin rules from workspace-local node_modules', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-catalog-'))
    await mkdir(path.join(tmp, 'node_modules/eslint'), { recursive: true })
    await mkdir(path.join(tmp, 'node_modules/eslint-plugin-alpha'), { recursive: true })
    await mkdir(path.join(tmp, 'node_modules/@scope/eslint-plugin-beta'), { recursive: true })

    await writeFile(
      path.join(tmp, 'node_modules/eslint/package.json'),
      JSON.stringify({ name: 'eslint', version: '0.0.0', main: 'index.js' }, null, 2)
    )
    await writeFile(
      path.join(tmp, 'node_modules/eslint/use-at-your-own-risk.js'),
      "module.exports = { builtinRules: new Map([['no-alert', {}], ['no-console', {}]]) }\n"
    )

    await writeFile(
      path.join(tmp, 'node_modules/eslint-plugin-alpha/package.json'),
      JSON.stringify({ name: 'eslint-plugin-alpha', version: '0.0.0', main: 'index.js' }, null, 2)
    )
    await writeFile(
      path.join(tmp, 'node_modules/eslint-plugin-alpha/index.js'),
      "module.exports = { rules: { 'rule-a': {}, 'rule-b': {} } }\n"
    )

    await writeFile(
      path.join(tmp, 'node_modules/@scope/eslint-plugin-beta/package.json'),
      JSON.stringify({ name: '@scope/eslint-plugin-beta', version: '0.0.0', main: 'index.js' }, null, 2)
    )
    await writeFile(path.join(tmp, 'node_modules/@scope/eslint-plugin-beta/index.js'), "module.exports = { rules: { baz: {} } }\n")

    const catalog = await discoverWorkspaceRuleCatalog(tmp)
    expect(catalog.coreRules).toEqual(['no-alert', 'no-console'])
    expect(catalog.pluginRulesByPrefix).toEqual({
      '@scope/beta/': ['@scope/beta/baz'],
      'alpha/': ['alpha/rule-a', 'alpha/rule-b']
    })
    expect(catalog.allRules).toEqual(['@scope/beta/baz', 'alpha/rule-a', 'alpha/rule-b', 'no-alert', 'no-console'])
  })

  it('returns empty catalog when eslint/plugin modules are not resolvable', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshot-catalog-empty-'))
    await writeFile(
      path.join(tmp, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture',
          private: true,
          devDependencies: {
            'eslint-plugin-not-installed': '1.0.0'
          }
        },
        null,
        2
      )
    )

    const catalog = await discoverWorkspaceRuleCatalog(tmp)
    expect(catalog).toEqual({
      coreRules: [],
      pluginRulesByPrefix: {},
      allRules: []
    })
  })
})
