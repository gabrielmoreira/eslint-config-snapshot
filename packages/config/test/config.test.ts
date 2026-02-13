import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG, loadConfig } from '../src/index.js'

let tmp = ''

afterAll(async () => {
  if (tmp) {
    await rm(tmp, { recursive: true, force: true })
  }
})

describe('loadConfig', () => {
  it('returns defaults when config missing', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshotter-config-'))
    const config = await loadConfig(tmp)
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('loads first matching config file', async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'snapshotter-config-'))
    await writeFile(path.join(tmp, '.eslint-config-snapshotter.js'), 'export default { sampling: { maxFilesPerWorkspace: 3 } }\n')
    await writeFile(path.join(tmp, 'eslint-config-snapshotter.config.mjs'), 'export default { sampling: { maxFilesPerWorkspace: 9 } }\n')

    const config = await loadConfig(tmp)
    expect(config.sampling.maxFilesPerWorkspace).toBe(3)
  })
})
