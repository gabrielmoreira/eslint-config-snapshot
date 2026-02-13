import { discoverWorkspaces, findConfigPath, getConfigScaffold, normalizePath } from '@eslint-config-snapshot/api'
import fg from 'fast-glob'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type InitTarget = 'file' | 'package-json'
type InitPreset = 'recommended' | 'minimal' | 'full'

type InitOptions = { target?: InitTarget; preset?: InitPreset; force?: boolean; yes?: boolean; showEffective?: boolean }

type InitRuntime = {
  runPromptWithPausedTimer: <T>(prompt: () => Promise<T>) => Promise<T>
  writeStdout: (message: string) => void
  writeStderr: (message: string) => void
}

export async function runInit(cwd: string, opts: InitOptions, runtime: InitRuntime): Promise<number> {
  const force = opts.force ?? false
  const showEffective = opts.showEffective ?? false
  const existing = await findConfigPath(cwd)
  if (existing && !force) {
    runtime.writeStderr(
      `Existing config detected at ${existing.path}. Creating another config can cause conflicts. Remove the existing config or rerun with --force.\n`
    )
    return 1
  }

  let target = opts.target
  let preset = opts.preset
  if (!opts.yes && !target && !preset && process.stdin.isTTY && process.stdout.isTTY) {
    const interactive = await askInitPreferences(runtime)
    target = interactive.target
    preset = interactive.preset
  }

  const finalTarget = target ?? 'file'
  const finalPreset = preset ?? 'recommended'
  const configObject = await resolveInitConfigObject(cwd, finalPreset, Boolean(opts.yes), runtime)

  if (showEffective) {
    runtime.writeStdout(`Effective config preview:\n${JSON.stringify(configObject, null, 2)}\n`)
  }

  if (finalTarget === 'package-json') {
    return runInitInPackageJson(cwd, configObject, force, runtime)
  }

  return runInitInFile(cwd, configObject, force, runtime)
}

async function askInitPreferences(runtime: InitRuntime): Promise<{ target: InitTarget; preset: InitPreset }> {
  const { select } = await import('@inquirer/prompts')
  const target = await runtime.runPromptWithPausedTimer(() => askInitTarget(select))
  const preset = await runtime.runPromptWithPausedTimer(() => askInitPreset(select))
  return { target, preset }
}

async function askInitTarget(
  selectPrompt: (options: { message: string; choices: Array<{ name: string; value: InitTarget }> }) => Promise<InitTarget>
): Promise<InitTarget> {
  return selectPrompt({
    message: 'Select config target',
    choices: [
      { name: 'package-json (recommended)', value: 'package-json' },
      { name: 'file', value: 'file' }
    ]
  })
}

async function askInitPreset(
  selectPrompt: (options: { message: string; choices: Array<{ name: string; value: InitPreset }> }) => Promise<InitPreset>
): Promise<InitPreset> {
  return selectPrompt({
    message: 'Select preset',
    choices: [
      { name: 'recommended (dynamic catch-all "*" + optional static exceptions)', value: 'recommended' },
      { name: 'minimal', value: 'minimal' },
      { name: 'full', value: 'full' }
    ]
  })
}

async function runInitInFile(
  cwd: string,
  configObject: Record<string, unknown>,
  force: boolean,
  runtime: InitRuntime
): Promise<number> {
  const candidates = [
    '.eslint-config-snapshot.js',
    '.eslint-config-snapshot.cjs',
    '.eslint-config-snapshot.mjs',
    'eslint-config-snapshot.config.js',
    'eslint-config-snapshot.config.cjs',
    'eslint-config-snapshot.config.mjs'
  ]

  for (const candidate of candidates) {
    try {
      await access(path.join(cwd, candidate))
      if (!force) {
        runtime.writeStderr(`Config already exists: ${candidate}\n`)
        return 1
      }
    } catch {
      // continue
    }
  }

  const target = path.join(cwd, 'eslint-config-snapshot.config.mjs')
  await writeFile(target, toConfigScaffold(configObject), 'utf8')
  runtime.writeStdout(`Created ${path.basename(target)}\n`)
  return 0
}

async function runInitInPackageJson(
  cwd: string,
  configObject: Record<string, unknown>,
  force: boolean,
  runtime: InitRuntime
): Promise<number> {
  const packageJsonPath = path.join(cwd, 'package.json')

  let packageJsonRaw: string
  try {
    packageJsonRaw = await readFile(packageJsonPath, 'utf8')
  } catch {
    runtime.writeStderr('package.json not found in current directory.\n')
    return 1
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(packageJsonRaw) as Record<string, unknown>
  } catch {
    runtime.writeStderr('Invalid package.json (must be valid JSON).\n')
    return 1
  }

  if (parsed['eslint-config-snapshot'] !== undefined && !force) {
    runtime.writeStderr('Config already exists in package.json: eslint-config-snapshot\n')
    return 1
  }

  parsed['eslint-config-snapshot'] = configObject
  await writeFile(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  runtime.writeStdout('Created config in package.json under "eslint-config-snapshot"\n')
  return 0
}

async function resolveInitConfigObject(
  cwd: string,
  preset: InitPreset,
  nonInteractive: boolean,
  runtime: InitRuntime
): Promise<Record<string, unknown>> {
  if (preset === 'minimal') {
    return {}
  }

  if (preset === 'full') {
    return getFullPresetObject()
  }

  return buildRecommendedPresetObject(cwd, nonInteractive, runtime)
}

async function buildRecommendedPresetObject(
  cwd: string,
  nonInteractive: boolean,
  runtime: InitRuntime
): Promise<Record<string, unknown>> {
  const workspaces = await discoverInitWorkspaces(cwd)
  const useInteractiveGrouping = !nonInteractive && process.stdin.isTTY && process.stdout.isTTY
  const assignments = useInteractiveGrouping ? await askRecommendedGroupAssignments(workspaces, runtime) : new Map<string, number>()
  return buildRecommendedConfigFromAssignments(workspaces, assignments)
}

export function buildRecommendedConfigFromAssignments(
  workspaces: string[],
  assignments: Map<string, number>
): Record<string, unknown> {
  const groupNumbers = [...new Set(assignments.values())].sort((a, b) => a - b)
  if (groupNumbers.length === 0) {
    return {}
  }

  const explicitGroups = groupNumbers.map((number) => ({
    name: `group-${number}`,
    match: workspaces.filter((workspace) => assignments.get(workspace) === number)
  }))

  return {
    grouping: {
      mode: 'match',
      groups: [...explicitGroups, { name: 'default', match: ['**/*'] }]
    }
  }
}

async function discoverInitWorkspaces(cwd: string): Promise<string[]> {
  const discovered = await discoverWorkspaces({ cwd, workspaceInput: { mode: 'discover' } })
  if (!(discovered.workspacesRel.length === 1 && discovered.workspacesRel[0] === '.')) {
    return discovered.workspacesRel
  }

  const packageJsonPath = path.join(cwd, 'package.json')
  try {
    const raw = await readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as { workspaces?: string[] | { packages?: string[] } }
    let workspacePatterns: string[] = []
    if (Array.isArray(parsed.workspaces)) {
      workspacePatterns = parsed.workspaces
    } else if (parsed.workspaces && typeof parsed.workspaces === 'object' && Array.isArray(parsed.workspaces.packages)) {
      workspacePatterns = parsed.workspaces.packages
    }

    if (workspacePatterns.length === 0) {
      return discovered.workspacesRel
    }

    const workspacePackageFiles = await fg(workspacePatterns.map((pattern) => `${trimTrailingSlashes(pattern)}/package.json`), {
      cwd,
      onlyFiles: true,
      dot: true
    })
    const workspaceDirs = [...new Set(workspacePackageFiles.map((entry) => normalizePath(path.dirname(entry))))].sort((a, b) =>
      a.localeCompare(b)
    )
    if (workspaceDirs.length > 0) {
      return workspaceDirs
    }
  } catch {
    // fallback to discovered output
  }

  return discovered.workspacesRel
}

function trimTrailingSlashes(value: string): string {
  let normalized = value
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

async function askRecommendedGroupAssignments(workspaces: string[], runtime: InitRuntime): Promise<Map<string, number>> {
  const { checkbox, select } = await import('@inquirer/prompts')
  runtime.writeStdout('Recommended setup: default group "*" is a dynamic catch-all for every discovered workspace.\n')
  runtime.writeStdout('Select only workspaces that should move to explicit static groups.\n')
  const overrides = await runtime.runPromptWithPausedTimer(() =>
    checkbox<string>({
      message: 'Choose exception workspaces (leave empty to keep all in default "*"):',
      choices: workspaces.map((workspace) => ({ name: workspace, value: workspace })),
      pageSize: Math.min(12, Math.max(4, workspaces.length))
    })
  )

  const assignments = new Map<string, number>()
  let nextGroup = 1
  for (const workspace of overrides) {
    const usedGroups = [...new Set(assignments.values())].sort((a, b) => a - b)
    while (usedGroups.includes(nextGroup)) {
      nextGroup += 1
    }

    const selected = await runtime.runPromptWithPausedTimer(() =>
      select<number | 'new'>({
        message: `Select group for ${workspace}`,
        choices: [
          ...usedGroups.map((group) => ({ name: `group-${group}`, value: group })),
          { name: `create new group (group-${nextGroup})`, value: 'new' }
        ]
      })
    )
    const groupNumber = selected === 'new' ? nextGroup : selected
    assignments.set(workspace, groupNumber)
  }

  return assignments
}

function toConfigScaffold(configObject: Record<string, unknown>): string {
  if (Object.keys(configObject).length === 0) {
    return getConfigScaffold('minimal')
  }

  return `export default ${JSON.stringify(configObject, null, 2)}\n`
}

function getFullPresetObject() {
  return {
    workspaceInput: { mode: 'discover' },
    grouping: {
      mode: 'match',
      groups: [{ name: 'default', match: ['**/*'] }]
    },
    sampling: {
      maxFilesPerWorkspace: 10,
      includeGlobs: ['**/*.{js,jsx,ts,tsx,cjs,mjs,md,mdx}'],
      excludeGlobs: ['**/node_modules/**', '**/dist/**'],
      tokenHints: [
        'chunk',
        'conf',
        'config',
        'container',
        'controller',
        'helpers',
        'mock',
        'mocks',
        'presentation',
        'repository',
        'route',
        'routes',
        'schema',
        'setup',
        'spec',
        'stories',
        'style',
        'styles',
        'test',
        'type',
        'types',
        'utils',
        'view',
        'views'
      ]
    }
  }
}
