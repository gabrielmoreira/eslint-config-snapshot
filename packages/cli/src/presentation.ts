import { normalizePath } from '@eslint-config-snapshot/api'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { formatCommandDisplayLabel, formatStoredSnapshotSummary } from './output.js'
import { type GroupEslintVersions, type StoredSnapshot } from './runtime.js'
import { type TerminalIO } from './terminal.js'

let cachedCliVersion: string | undefined

export function writeRunContextHeader(
  terminal: TerminalIO,
  cwd: string,
  commandLabel: string,
  configPath: string | undefined,
  storedSnapshots: Map<string, StoredSnapshot>
): void {
  if (!terminal.showProgress) {
    return
  }

  terminal.write(terminal.bold(`eslint-config-snapshot v${readCliVersion()} • ${formatCommandDisplayLabel(commandLabel)}\n`))
  terminal.write(`📁 Repository: ${cwd}\n`)
  terminal.write(`📁 Baseline: ${formatStoredSnapshotSummary(storedSnapshots)}\n`)
  terminal.write(`⚙️ Config source: ${formatConfigSource(cwd, configPath)}\n`)
  terminal.write('\n')
}

export function writeEslintVersionSummary(terminal: TerminalIO, eslintVersionsByGroup: GroupEslintVersions): void {
  if (!terminal.showProgress || eslintVersionsByGroup.size === 0) {
    return
  }

  const allVersions = new Set<string>()
  for (const versions of eslintVersionsByGroup.values()) {
    for (const version of versions) {
      allVersions.add(version)
    }
  }

  const sortedAllVersions = [...allVersions].sort((a, b) => a.localeCompare(b))
  if (sortedAllVersions.length === 1) {
    terminal.write(`- 🧩 eslint runtime: ${sortedAllVersions[0]} (all groups)\n`)
    return
  }

  terminal.write('- 🧩 eslint runtime by group:\n')
  const sortedEntries = [...eslintVersionsByGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [groupName, versions] of sortedEntries) {
    terminal.write(`  - ${groupName}: ${versions.join(', ')}\n`)
  }
}

function formatConfigSource(cwd: string, configPath: string | undefined): string {
  if (!configPath) {
    return 'built-in defaults'
  }

  const rel = normalizePath(path.relative(cwd, configPath))
  if (path.basename(configPath) === 'package.json') {
    return `${rel} (eslint-config-snapshot field)`
  }

  return rel
}

function readCliVersion(): string {
  if (cachedCliVersion !== undefined) {
    return cachedCliVersion
  }

  const envPackageName = process.env.npm_package_name
  const envPackageVersion = process.env.npm_package_version
  if (isCliPackageName(envPackageName) && typeof envPackageVersion === 'string' && envPackageVersion.length > 0) {
    cachedCliVersion = envPackageVersion
    return cachedCliVersion
  }

  const scriptPath = process.argv[1]
  if (!scriptPath) {
    cachedCliVersion = 'unknown'
    return cachedCliVersion
  }

  try {
    const req = createRequire(path.resolve(scriptPath))
    const resolvedCliEntry = req.resolve('@eslint-config-snapshot/cli')
    const resolvedVersion = readVersionFromResolvedEntry(resolvedCliEntry)
    if (resolvedVersion !== undefined) {
      cachedCliVersion = resolvedVersion
      return cachedCliVersion
    }
  } catch {
    // continue to path-walk fallback
  }

  let current = path.resolve(path.dirname(scriptPath))
  let fallbackVersion: string | undefined
  while (true) {
    const packageJsonPath = path.join(current, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const raw = readFileSync(packageJsonPath, 'utf8')
        const parsed = JSON.parse(raw) as { name?: string; version?: string }
        if (typeof parsed.version === 'string' && parsed.version.length > 0) {
          if (isCliPackageName(parsed.name)) {
            cachedCliVersion = parsed.version
            return cachedCliVersion
          }

          if (fallbackVersion === undefined) {
            fallbackVersion = parsed.version
          }
        }
      } catch {
        // continue walking up
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  cachedCliVersion = fallbackVersion ?? 'unknown'
  return cachedCliVersion
}

function isCliPackageName(value: string | undefined): boolean {
  return value === '@eslint-config-snapshot/cli' || value === 'eslint-config-snapshot'
}

function readVersionFromResolvedEntry(entryAbs: string): string | undefined {
  let current = path.resolve(path.dirname(entryAbs))

  while (true) {
    const packageJsonPath = path.join(current, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const raw = readFileSync(packageJsonPath, 'utf8')
        const parsed = JSON.parse(raw) as { name?: string; version?: string }
        if (isCliPackageName(parsed.name) && typeof parsed.version === 'string' && parsed.version.length > 0) {
          return parsed.version
        }
      } catch {
        // continue walking up
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return undefined
}
