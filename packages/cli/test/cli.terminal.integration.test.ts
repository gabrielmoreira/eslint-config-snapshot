import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const fixtureRoot = path.resolve('test/fixtures/repo')
const cliDist = path.resolve('dist/index.js')

let tmpDir = ''
let repoRoot = ''

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const proc = spawnSync(process.execPath, [cliDist, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ESLINT_CONFIG_SNAPSHOT_NO_PROGRESS: '1' }
  })

  return {
    status: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? ''
  }
}

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'snapshot-cli-terminal-'))
  repoRoot = path.join(tmpDir, 'repo')
  await cp(fixtureRoot, repoRoot, { recursive: true })
  await mkdir(path.join(repoRoot, 'packages/ws-a/node_modules/eslint/bin'), { recursive: true })
  await mkdir(path.join(repoRoot, 'packages/ws-b/node_modules/eslint/bin'), { recursive: true })
  await mkdir(path.join(repoRoot, 'packages/ws-a/node_modules/eslint-plugin-alpha'), { recursive: true })

  await writeFile(
    path.join(repoRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
    "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: [2, 'always'] } }))\n"
  )
  await writeFile(
    path.join(repoRoot, 'packages/ws-a/node_modules/eslint/package.json'),
    JSON.stringify({ name: 'eslint', version: '9.0.0' }, null, 2)
  )

  await writeFile(
    path.join(repoRoot, 'packages/ws-b/node_modules/eslint/bin/eslint.js'),
    "console.log(JSON.stringify({ rules: { 'no-console': 2, 'no-debugger': 0 } }))\n"
  )
  await writeFile(
    path.join(repoRoot, 'packages/ws-b/node_modules/eslint/package.json'),
    JSON.stringify({ name: 'eslint', version: '9.0.0' }, null, 2)
  )
  await writeFile(
    path.join(repoRoot, 'packages/ws-a/node_modules/eslint/use-at-your-own-risk.js'),
    "module.exports = { builtinRules: new Map([['no-console', {}], ['no-alert', {}], ['eqeqeq', {}]]) }\n"
  )
  await writeFile(
    path.join(repoRoot, 'packages/ws-a/node_modules/eslint-plugin-alpha/package.json'),
    JSON.stringify({ name: 'eslint-plugin-alpha', version: '1.0.0', main: 'index.js' }, null, 2)
  )
  await writeFile(
    path.join(repoRoot, 'packages/ws-a/node_modules/eslint-plugin-alpha/index.js'),
    "module.exports = { rules: { 'only-in-catalog': {}, observed: {} } }\n"
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
    expect(result.stdout).toContain('Usage: eslint-config-snapshot [options] [command]')
    expect(result.stdout).toContain('check [options]')
    expect(result.stdout).toContain('update|snapshot')
    expect(result.stdout).toContain('print [options]')
    expect(result.stdout).toContain('catalog [options]')
    expect(result.stdout).toContain('catalog-check')
    expect(result.stdout).toContain('catalog-update')
    expect(result.stdout).toContain('config [options]')
    expect(result.stdout).toContain('init')
    expect(result.stderr).toBe('')
  })

  it('returns 1 for unknown command', () => {
    const result = run(['unknown'])
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("error: unknown command 'unknown'")
  })

  it('snapshot succeeds and compare returns clean result', () => {
    const snapshot = run(['snapshot'])
    expect(snapshot.status).toBe(0)
    expect(snapshot.stdout).toContain('baseline was successfully created')
    expect(snapshot.stderr).toBe('')

    const compare = run(['compare'])
    expect(compare.status).toBe(0)
    expect(compare.stdout).toBe('Great news: no snapshot changes detected.\n')
    expect(compare.stderr).toBe('')
  })

  it('default command prints clean summary when no drift', () => {
    expect(run(['snapshot']).status).toBe(0)
    const result = run([])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Great news: no snapshot drift detected.')
  })

  it('default command reports missing local snapshots', () => {
    const result = run([])
    expect(result.status).toBe(1)
    expect(result.stdout).toBe(
      'Rules found in this analysis: 1 groups, 3 rules (severity mix: 2 errors, 0 warnings, 1 off).\nYou are almost set: no baseline snapshot found yet.\nRun `eslint-config-snapshot --update` to create your first baseline.\n'
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
      'group: default\nseverity changed:\n  - eqeqeq: error -> off\nTip: when you intentionally accept changes, run `eslint-config-snapshot --update` to refresh the baseline.\n'
    )
    expect(compare.stderr).toBe('')
  })

  it('compare shows options changed when severity does not change', async () => {
    expect(run(['snapshot']).status).toBe(0)

    await writeFile(
      path.join(repoRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
      "console.log(JSON.stringify({ rules: { 'no-console': 1, eqeqeq: [2, 'smart'] } }))\n"
    )

    const compare = run(['compare'])
    expect(compare.status).toBe(1)
    expect(compare.stdout).toBe(
      'group: default\noptions changed:\n  - eqeqeq: [["error","always"]] -> [["error","smart"]]\nTip: when you intentionally accept changes, run `eslint-config-snapshot --update` to refresh the baseline.\n'
    )
    expect(compare.stderr).toBe('')
  })

  it('compare prints removed rules as nested list', async () => {
    expect(run(['snapshot']).status).toBe(0)

    await writeFile(
      path.join(repoRoot, 'packages/ws-a/node_modules/eslint/bin/eslint.js'),
      "console.log(JSON.stringify({ rules: { 'no-console': 1 } }))\n"
    )

    const compare = run(['compare'])
    expect(compare.status).toBe(1)
    expect(compare.stdout).toContain('removed rules:\n  - eqeqeq\n')
    expect(compare.stdout).not.toContain('options changed:\n  - eqeqeq')
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
    expect(changed.stdout).toBe(
      'changes\nTip: when you intentionally accept changes, run `eslint-config-snapshot --update` to refresh the baseline.\n'
    )
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
        [
          "error"
        ],
        [
          "warn"
        ]
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
no-console: [["error"],["warn"]]
no-debugger: off
`
    )
    expect(result.stderr).toBe('')
  })

  it('catalog --missing returns deterministic json output', () => {
    const result = run(['catalog', '--missing'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"groupId": "default"')
    expect(result.stdout).toContain('"totalStats"')
    expect(result.stdout).toContain('"coreStats"')
    expect(result.stdout).toContain('"pluginStats"')
    expect(result.stdout).toContain('"missingRules"')
    expect(result.stdout).toContain('"alpha/observed"')
    expect(result.stdout).toContain('"alpha/only-in-catalog"')
    expect(result.stdout).toContain('"no-alert"')
    expect(result.stderr).toBe('')
  })

  it('catalog --short --missing returns compact output', () => {
    const result = run(['catalog', '--short', '--missing'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('📦 total: 2/5 in use')
    expect(result.stdout).toContain('🧱 core: 2/3 in use')
    expect(result.stdout).toContain('🔌 plugins tracked: 1')
    expect(result.stdout).toContain('  - alpha: 0/2 in use')
    expect(result.stdout).toContain('🕳️ missing list (3):')
    expect(result.stdout).toContain('alpha/observed')
    expect(result.stdout).toContain('alpha/only-in-catalog')
    expect(result.stdout).toContain('no-alert')
    expect(result.stderr).toBe('')
  })

  it('catalog-update writes baseline and catalog-check returns clean', () => {
    const update = run(['catalog-update'])
    expect(update.status).toBe(0)
    expect(update.stdout).toContain('Catalog baseline updated:')
    expect(update.stdout).toContain('📦 total:')
    expect(update.stdout).toContain('🔌 plugins tracked:')
    expect(update.stderr).toBe('')

    const check = run(['catalog-check'])
    expect(check.status).toBe(0)
    expect(check.stdout).toContain('Great news: no catalog drift detected.')
    expect(check.stdout).toContain('📦 total:')
    expect(check.stdout).toContain('🔌 plugins tracked:')
    expect(check.stderr).toBe('')
  })

  it('default experimental mode updates and checks catalog baseline', () => {
    const update = run(['--update', '--experimental-with-catalog'])
    expect(update.status).toBe(0)
    expect(update.stdout).toContain('baseline was successfully created')
    expect(update.stdout).toContain('Catalog baseline updated:')
    expect(update.stderr).toBe('')

    const check = run(['--experimental-with-catalog'])
    expect(check.status).toBe(0)
    expect(check.stdout).toContain('Great news: no snapshot drift detected.')
    expect(check.stdout).toContain('Great news: no catalog drift detected.')
    expect(check.stderr).toBe('')
  })

  it('init handles success and existing-file error paths', async () => {
    const initRoot = path.join(tmpDir, 'init-case')
    await rm(initRoot, { recursive: true, force: true })
    await cp(fixtureRoot, initRoot, { recursive: true })
    repoRoot = initRoot

    await rm(path.join(repoRoot, 'eslint-config-snapshot.config.mjs'), { force: true })

    const created = run(['init', '--yes', '--target', 'file', '--preset', 'minimal'])
    expect(created.status).toBe(0)
    expect(created.stdout).toBe('Created eslint-config-snapshot.config.mjs\n')
    expect(created.stderr).toBe('')

    const existing = run(['init', '--yes', '--target', 'file'])
    expect(existing.status).toBe(1)
    expect(existing.stdout).toBe('')
    expect(existing.stderr).toContain('Existing config detected at ')
    expect(existing.stderr).toContain('rerun with --force')
  })

  it('config prints effective evaluated config output', () => {
    const result = run(['config'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"workspaceInput"')
    expect(result.stdout).toContain('"workspaces"')
    expect(result.stdout).toContain('"groups"')
    expect(result.stderr).toBe('')
  })

  it('init can write config to package.json', async () => {
    const initRoot = path.join(tmpDir, 'init-package-json-case')
    await rm(initRoot, { recursive: true, force: true })
    await cp(fixtureRoot, initRoot, { recursive: true })
    repoRoot = initRoot

    await rm(path.join(repoRoot, 'eslint-config-snapshot.config.mjs'), { force: true })

    const created = run(['init', '--yes', '--target', 'package-json', '--preset', 'minimal'])
    expect(created.status).toBe(0)
    expect(created.stdout).toBe('Created config in package.json under "eslint-config-snapshot"\n')
    expect(created.stderr).toBe('')

    const packageJsonRaw = await readFile(path.join(repoRoot, 'package.json'), 'utf8')
    const parsed = JSON.parse(packageJsonRaw) as { 'eslint-config-snapshot'?: Record<string, unknown> }
    expect(parsed['eslint-config-snapshot']).toEqual({})
  })

  it('init recommended writes grouped workspace config in package.json', async () => {
    const initRoot = path.join(tmpDir, 'init-recommended-package-json-case')
    await rm(initRoot, { recursive: true, force: true })
    await cp(fixtureRoot, initRoot, { recursive: true })
    repoRoot = initRoot

    await rm(path.join(repoRoot, 'eslint-config-snapshot.config.mjs'), { force: true })

    const created = run(['init', '--yes', '--target', 'package-json', '--preset', 'recommended'])
    expect(created.status).toBe(0)
    expect(created.stdout).toBe('Created config in package.json under "eslint-config-snapshot"\n')
    expect(created.stderr).toBe('')

    const packageJsonRaw = await readFile(path.join(repoRoot, 'package.json'), 'utf8')
    const parsed = JSON.parse(packageJsonRaw) as {
      'eslint-config-snapshot'?: Record<string, unknown>
    }

    expect(parsed['eslint-config-snapshot']).toEqual({})
  })

  it('init recommended --show-effective prints preview without explicit sampling block', async () => {
    const initRoot = path.join(tmpDir, 'init-recommended-preview-case')
    await rm(initRoot, { recursive: true, force: true })
    await cp(fixtureRoot, initRoot, { recursive: true })
    repoRoot = initRoot

    await rm(path.join(repoRoot, 'eslint-config-snapshot.config.mjs'), { force: true })

    const result = run(['init', '--yes', '--target', 'package-json', '--preset', 'recommended', '--show-effective'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Effective config preview:')
    expect(result.stdout).toContain('{}')
    expect(result.stdout).not.toContain('"workspaceInput"')
    expect(result.stdout).not.toContain('"grouping"')
    expect(result.stdout).not.toContain('"sampling"')
  })

  it('init fails early on existing config unless --force is provided', async () => {
    const initRoot = path.join(tmpDir, 'init-force-case')
    await rm(initRoot, { recursive: true, force: true })
    await cp(fixtureRoot, initRoot, { recursive: true })
    repoRoot = initRoot

    await writeFile(
      path.join(repoRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture-repo',
          private: true,
          'eslint-config-snapshot': {
            grouping: { mode: 'standalone' }
          }
        },
        null,
        2
      )
    )

    const blocked = run(['init', '--yes', '--target', 'file', '--preset', 'full'])
    expect(blocked.status).toBe(1)
    expect(blocked.stdout).toBe('')
    expect(blocked.stderr).toContain('Existing config detected at ')
    expect(blocked.stderr).toContain('rerun with --force')

    const forced = run(['init', '--yes', '--force', '--target', 'file', '--preset', 'full'])
    expect(forced.status).toBe(0)
    expect(forced.stdout).toBe('Created eslint-config-snapshot.config.mjs\n')
    expect(forced.stderr).toBe('')
  })

  it('surfaces runtime errors with exit code 1', async () => {
    await writeFile(
      path.join(repoRoot, 'eslint-config-snapshot.config.mjs'),
      `export default {
  workspaceInput: { mode: 'manual', workspaces: ['packages/ws-a'] },
  grouping: { mode: 'match', allowEmptyGroups: false, groups: [{ name: 'never', match: ['ops/**'] }] },
  sampling: { maxFilesPerWorkspace: 8, includeGlobs: ['**/*.ts'], excludeGlobs: ['**/node_modules/**'] }
}
`
    )

    const result = run(['snapshot'])
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('Unmatched workspaces: packages/ws-a\n')
  })

  it('loads config from package.json through cosmiconfig', async () => {
    await rm(path.join(repoRoot, 'eslint-config-snapshot.config.mjs'), { force: true })
    await writeFile(
      path.join(repoRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture-repo',
          private: true,
          workspaces: ['packages/*'],
          'eslint-config-snapshot': {
            workspaceInput: { mode: 'manual', workspaces: ['packages/ws-a'] },
            grouping: { mode: 'match', groups: [{ name: 'default', match: ['**/*'] }] },
            sampling: { maxFilesPerWorkspace: 8, includeGlobs: ['**/*.ts'], excludeGlobs: ['**/node_modules/**'] }
          }
        },
        null,
        2
      )
    )

    const snapshot = run(['snapshot'])
    expect(snapshot.status).toBe(0)

    const raw = await readFile(path.join(repoRoot, '.eslint-config-snapshot/default.json'), 'utf8')
    const parsed = JSON.parse(raw) as { workspaces: string[] }
    expect(parsed.workspaces).toEqual(['packages/ws-a'])
  })

  it('updates snapshots with --update without command', () => {
    const result = run(['--update'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('baseline was successfully created')
    expect(result.stderr).toBe('')
  })

  it('prints updated message when baseline already exists', () => {
    const first = run(['--update'])
    expect(first.status).toBe(0)
    expect(first.stdout).toContain('baseline was successfully created')

    const second = run(['--update'])
    expect(second.status).toBe(0)
    expect(second.stdout).toContain('baseline was successfully updated')
    expect(second.stderr).toBe('')
  })

  it('prints init help with select-prompt and force guidance', () => {
    const result = run(['init', '--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Initialize config (file or package.json)')
    expect(result.stdout).toContain('-f, --force')
    expect(result.stdout).toContain('Runs interactive select prompts for target/preset.')
    expect(result.stdout).toContain('Recommended preset keeps a dynamic catch-all default group ("*")')
    expect(result.stdout).toContain('--show-effective')
    expect(result.stdout).toContain('--yes --force --target file --preset full')
    expect(result.stderr).toBe('')
  })

  it('supports canonical check and update commands', () => {
    const update = run(['update'])
    expect(update.status).toBe(0)
    expect(update.stdout).toContain('baseline was successfully created')

    const check = run(['check'])
    expect(check.status).toBe(0)
    expect(check.stdout).toContain('Great news: no snapshot drift detected.')
  })

  it('uses defaults and explains baseline setup when running default command', async () => {
    await rm(path.join(repoRoot, 'eslint-config-snapshot.config.mjs'), { force: true })
    await writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({ name: 'fixture-repo', private: true }, null, 2))

    const result = run([])
    expect(result.status).toBe(1)
    expect(result.stdout).toBe(
      'Tip: no explicit config found. Using safe built-in defaults. Run `eslint-config-snapshot init` to customize when needed.\nAutomatic workspace discovery could not complete with defaults.\nRun `eslint-config-snapshot init` to configure workspaces, then run `eslint-config-snapshot --update`.\n'
    )
  })
})
