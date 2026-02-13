import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const fixtureRoot = path.resolve('test/fixtures/repo')
const cliDist = path.resolve('dist/index.js')

const HELP_TEXT = `eslint-config-snapshotter

Usage:
  eslint-config-snapshotter [command] [options]

Commands:
  snapshot   Compute and write snapshots to .eslint-config-snapshots/
  compare    Compare current state against stored snapshots
  what-changed Compare current state against stored snapshots and print a human summary
  status     Print minimal status (clean/changes)
  print      Print aggregated rules (JSON by default)
  init       Create eslint-config-snapshotter.config.mjs
  help       Show this help

Options:
  -h, --help   Show this help
  --update     Update snapshots (usable without command)
  --short      Print compact human-readable output (print command only)
`

let tmpDir = ''
let repoRoot = ''

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const proc = spawnSync(process.execPath, [cliDist, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env }
  })

  return {
    status: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? ''
  }
}

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'snapshotter-cli-terminal-'))
  repoRoot = path.join(tmpDir, 'repo')
  await cp(fixtureRoot, repoRoot, { recursive: true })

  await writeFile(
    path.join(repoRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
    "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: [2, 'always'] } }))\n"
  )
})

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true })
    tmpDir = ''
    repoRoot = ''
  }
})

describe('cli terminal invocation', () => {
  it('prints help text and exits 0', () => {
    const result = run(['--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(HELP_TEXT)
    expect(result.stderr).toBe('')
  })

  it('returns 1 for unknown command', () => {
    const result = run(['unknown'])
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('Unknown command: unknown\n')
  })

  it('snapshot succeeds and compare returns clean result', () => {
    const snapshot = run(['snapshot'])
    expect(snapshot.status).toBe(0)
    expect(snapshot.stdout).toBe('')
    expect(snapshot.stderr).toBe('')

    const compare = run(['compare'])
    expect(compare.status).toBe(0)
    expect(compare.stdout).toBe('No snapshot changes detected.\n')
    expect(compare.stderr).toBe('')
  })

  it('default command prints clean summary when no drift', () => {
    expect(run(['snapshot']).status).toBe(0)
    const result = run([])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No snapshot drift detected.')
  })

  it('default command reports missing local snapshots', () => {
    const result = run([])
    expect(result.status).toBe(1)
    expect(result.stdout).toBe(
      'No local snapshots found to compare against.\nRun `eslint-config-snapshotter --update` first.\n'
    )
  })

  it('compare returns 1 and deterministic diff output when rules change', async () => {
    expect(run(['snapshot']).status).toBe(0)

    await writeFile(
      path.join(repoRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
      "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: 0 } }))\n"
    )

    const compare = run(['compare'])
    expect(compare.status).toBe(1)
    expect(compare.stdout).toBe(
      'group: default\nseverity changed: eqeqeq error -> off\noptions changed: eqeqeq "always" -> undefined\n'
    )
    expect(compare.stderr).toBe('')
  })

  it('status returns clean and changes variants', async () => {
    expect(run(['snapshot']).status).toBe(0)

    const clean = run(['status'])
    expect(clean.status).toBe(0)
    expect(clean.stdout).toBe('clean\n')
    expect(clean.stderr).toBe('')

    await writeFile(
      path.join(repoRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
      "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: 0 } }))\n"
    )

    const changed = run(['status'])
    expect(changed.status).toBe(1)
    expect(changed.stdout).toBe('changes\n')
    expect(changed.stderr).toBe('')
  })

  it('print returns deterministic json output', () => {
    const result = run(['print'])
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(
      `[
  {
    "groupId": "default",
    "rules": {
      "eqeqeq": [
        "error",
        "always"
      ],
      "no-console": [
        "error"
      ],
      "no-debugger": [
        "off"
      ]
    }
  }
]
`
    )
    expect(result.stderr).toBe('')
  })

  it('print --short returns compact human-readable output', () => {
    const result = run(['print', '--short'])
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(
      `group: default
workspaces (2): packages/ws-a, packages/ws-b
rules (3): error 2, warn 0, off 1
eqeqeq: error "always"
no-console: error
no-debugger: off
`
    )
    expect(result.stderr).toBe('')
  })

  it('init handles success and existing-file error paths', async () => {
    const initRoot = path.join(tmpDir, 'init-case')
    await rm(initRoot, { recursive: true, force: true })
    await cp(fixtureRoot, initRoot, { recursive: true })
    repoRoot = initRoot

    await rm(path.join(repoRoot, 'eslint-config-snapshotter.config.mjs'), { force: true })

    const created = run(['init'])
    expect(created.status).toBe(0)
    expect(created.stdout).toBe('Created eslint-config-snapshotter.config.mjs\n')
    expect(created.stderr).toBe('')

    const existing = run(['init'])
    expect(existing.status).toBe(1)
    expect(existing.stdout).toBe('')
    expect(existing.stderr).toBe('Config already exists: eslint-config-snapshotter.config.mjs\n')
  })

  it('surfaces runtime errors with exit code 1', async () => {
    await writeFile(
      path.join(repoRoot, 'eslint-config-snapshotter.config.mjs'),
      `export default {
  workspaceInput: { mode: 'manual', workspaces: ['packages/ws-a'] },
  grouping: { mode: 'match', allowEmptyGroups: false, groups: [{ name: 'never', match: ['ops/**'] }] },
  sampling: { maxFilesPerWorkspace: 8, includeGlobs: ['**/*.ts'], excludeGlobs: ['**/node_modules/**'], hintGlobs: [] }
}
`
    )

    const result = run(['snapshot'])
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('Unmatched workspaces: packages/ws-a\n')
  })

  it('loads config from package.json through cosmiconfig', async () => {
    await rm(path.join(repoRoot, 'eslint-config-snapshotter.config.mjs'), { force: true })
    await writeFile(
      path.join(repoRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture-repo',
          private: true,
          workspaces: ['packages/*'],
          'eslint-config-snapshotter': {
            workspaceInput: { mode: 'manual', workspaces: ['packages/ws-a'] },
            grouping: { mode: 'match', groups: [{ name: 'default', match: ['**/*'] }] },
            sampling: { maxFilesPerWorkspace: 8, includeGlobs: ['**/*.ts'], excludeGlobs: ['**/node_modules/**'], hintGlobs: [] }
          }
        },
        null,
        2
      )
    )

    const snapshot = run(['snapshot'])
    expect(snapshot.status).toBe(0)

    const raw = await readFile(path.join(repoRoot, '.eslint-config-snapshots/default.json'), 'utf8')
    const parsed = JSON.parse(raw) as { workspaces: string[] }
    expect(parsed.workspaces).toEqual(['packages/ws-a'])
  })

  it('updates snapshots with --update without command', () => {
    const result = run(['--update'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Snapshots updated:')
    expect(result.stderr).toBe('')
  })

  it('explains missing config when running default command', async () => {
    await rm(path.join(repoRoot, 'eslint-config-snapshotter.config.mjs'), { force: true })
    await writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({ name: 'fixture-repo', private: true }, null, 2))

    const result = run([])
    expect(result.status).toBe(1)
    expect(result.stdout).toBe(
      'No snapshotter config found.\nRun `eslint-config-snapshotter init` to create one, then run `eslint-config-snapshotter --update`.\n'
    )
  })
})
