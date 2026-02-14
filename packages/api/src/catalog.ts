import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export type WorkspaceRuleCatalog = {
  coreRules: string[]
  pluginRulesByPrefix: Record<string, string[]>
  allRules: string[]
}

export async function discoverWorkspaceRuleCatalog(workspaceAbs: string): Promise<WorkspaceRuleCatalog> {
  const anchor = path.join(workspaceAbs, '__snapshot_anchor__.cjs')
  const req = createRequire(anchor)

  const coreRules = await discoverCoreRules(req)
  const pluginPackageNames = await discoverPluginPackageNames(workspaceAbs)
  const pluginRulesByPrefix: Record<string, string[]> = {}

  for (const packageName of pluginPackageNames) {
    const prefix = pluginPrefixFromPackageName(packageName)
    if (!prefix) {
      continue
    }

    const ruleNames = await discoverPluginRuleNames(req, packageName)
    if (ruleNames.length === 0) {
      continue
    }

    const current = pluginRulesByPrefix[prefix] ?? []
    current.push(...ruleNames.map((ruleName) => `${prefix}${ruleName}`))
    pluginRulesByPrefix[prefix] = sortUnique(current)
  }

  const allRules = sortUnique([...coreRules, ...Object.values(pluginRulesByPrefix).flat()])
  return {
    coreRules,
    pluginRulesByPrefix: Object.fromEntries(
      Object.entries(pluginRulesByPrefix).sort((a, b) => a[0].localeCompare(b[0]))
    ),
    allRules
  }
}

async function discoverCoreRules(req: NodeJS.Require): Promise<string[]> {
  try {
    const resolved = req.resolve('eslint/use-at-your-own-risk')
    const moduleExports = (await import(pathToFileURL(resolved).href)) as {
      builtinRules?: Map<string, unknown>
      default?: { builtinRules?: Map<string, unknown> }
    }
    const builtinRules = moduleExports.builtinRules ?? moduleExports.default?.builtinRules
    if (!builtinRules) {
      return []
    }

    return sortUnique([...builtinRules.keys()])
  } catch {
    return []
  }
}

async function discoverPluginRuleNames(req: NodeJS.Require, packageName: string): Promise<string[]> {
  try {
    const resolved = req.resolve(packageName)
    const moduleExports = (await import(pathToFileURL(resolved).href)) as {
      rules?: Record<string, unknown>
      default?: { rules?: Record<string, unknown> }
    }
    const pluginRules = moduleExports.rules ?? moduleExports.default?.rules
    if (!pluginRules || typeof pluginRules !== 'object') {
      return []
    }

    return sortUnique(Object.keys(pluginRules))
  } catch {
    return []
  }
}

function pluginPrefixFromPackageName(packageName: string): string | undefined {
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/')
    if (!scope || !name) {
      return undefined
    }
    if (name === 'eslint-plugin') {
      return `${scope}/`
    }
    if (name.startsWith('eslint-plugin-')) {
      return `${scope}/${name.slice('eslint-plugin-'.length)}/`
    }
    return undefined
  }

  if (packageName === 'eslint-plugin') {
    return ''
  }
  if (packageName.startsWith('eslint-plugin-')) {
    return `${packageName.slice('eslint-plugin-'.length)}/`
  }
  return undefined
}

async function discoverPluginPackageNames(workspaceAbs: string): Promise<string[]> {
  const results = new Set<string>()
  const nodeModulesDirectories = collectNodeModulesDirectories(workspaceAbs)

  for (const nodeModulesDirectory of nodeModulesDirectories) {
    const packageNames = await readPluginPackagesFromNodeModules(nodeModulesDirectory)
    for (const packageName of packageNames) {
      results.add(packageName)
    }
  }

  for (const packageJsonPath of collectPackageJsonPaths(workspaceAbs)) {
    const dependencyNames = await readPluginPackageNamesFromPackageJson(packageJsonPath)
    for (const packageName of dependencyNames) {
      results.add(packageName)
    }
  }

  return sortUnique([...results])
}

function collectNodeModulesDirectories(workspaceAbs: string): string[] {
  const directories: string[] = []
  let current = path.resolve(workspaceAbs)
  while (true) {
    directories.push(path.join(current, 'node_modules'))
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return directories
}

function collectPackageJsonPaths(workspaceAbs: string): string[] {
  const paths: string[] = []
  let current = path.resolve(workspaceAbs)
  while (true) {
    paths.push(path.join(current, 'package.json'))
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return paths
}

async function readPluginPackagesFromNodeModules(nodeModulesDirectory: string): Promise<string[]> {
  try {
    const entries = await readdir(nodeModulesDirectory, { withFileTypes: true })
    const results: string[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      if (entry.name.startsWith('eslint-plugin-')) {
        results.push(entry.name)
        continue
      }

      if (!entry.name.startsWith('@')) {
        continue
      }

      const scopeDirectory = path.join(nodeModulesDirectory, entry.name)
      const scopedEntries = await readdir(scopeDirectory, { withFileTypes: true })
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory()) {
          continue
        }
        if (scopedEntry.name === 'eslint-plugin' || scopedEntry.name.startsWith('eslint-plugin-')) {
          results.push(`${entry.name}/${scopedEntry.name}`)
        }
      }
    }

    return results
  } catch {
    return []
  }
}

async function readPluginPackageNamesFromPackageJson(packageJsonPath: string): Promise<string[]> {
  try {
    const raw = await readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    const allNames = new Set<string>()
    for (const record of [
      parsed.dependencies,
      parsed.devDependencies,
      parsed.peerDependencies,
      parsed.optionalDependencies
    ]) {
      for (const name of Object.keys(record ?? {})) {
        if (isEslintPluginPackageName(name)) {
          allNames.add(name)
        }
      }
    }

    return [...allNames]
  } catch {
    return []
  }
}

function isEslintPluginPackageName(name: string): boolean {
  return (
    name.startsWith('eslint-plugin-') ||
    name === 'eslint-plugin' ||
    name.includes('/eslint-plugin-') ||
    name.endsWith('/eslint-plugin')
  )
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}
