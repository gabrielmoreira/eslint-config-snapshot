import { normalizePath } from '@eslint-config-snapshot/api'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { createColorizer, formatCommandDisplayLabel, formatStoredSnapshotSummary } from './output.js'

import type { GroupEslintVersions, StoredSnapshot } from './runtime.js'

type RunTimer = {
  label: string
  startedAtMs: number
  pausedMs: number
  pauseStartedAtMs: number | undefined
}

let activeRunTimer: RunTimer | undefined
let cachedCliVersion: string | undefined

export function shouldShowRunLogs(): boolean {
  if (process.env.ESLINT_CONFIG_SNAPSHOT_NO_PROGRESS === '1') {
    return false
  }
  return process.stdout.isTTY === true
}

export function beginRunTimer(label: string): void {
  if (!shouldShowRunLogs()) {
    activeRunTimer = undefined
    return
  }

  activeRunTimer = {
    label,
    startedAtMs: Date.now(),
    pausedMs: 0,
    pauseStartedAtMs: undefined
  }
}

export function endRunTimer(exitCode: number, logTiming: (timer: RunTimer, elapsedMs: number) => void): void {
  if (!activeRunTimer || !shouldShowRunLogs()) {
    return
  }

  if (activeRunTimer.pauseStartedAtMs !== undefined) {
    activeRunTimer.pausedMs += Date.now() - activeRunTimer.pauseStartedAtMs
    activeRunTimer.pauseStartedAtMs = undefined
  }

  const elapsedMs = Math.max(0, Date.now() - activeRunTimer.startedAtMs - activeRunTimer.pausedMs)
  logTiming(activeRunTimer, elapsedMs)

  const seconds = (elapsedMs / 1000).toFixed(2)
  if (exitCode === 0) {
    writeSubtleInfo(`⏱️ Finished in ${seconds}s\n`)
  } else {
    writeSubtleInfo(`⏱️ Finished with errors in ${seconds}s\n`)
  }
  activeRunTimer = undefined
}

export function pauseRunTimer(): void {
  if (!activeRunTimer || activeRunTimer.pauseStartedAtMs !== undefined) {
    return
  }
  activeRunTimer.pauseStartedAtMs = Date.now()
}

export function resumeRunTimer(): void {
  if (!activeRunTimer || activeRunTimer.pauseStartedAtMs === undefined) {
    return
  }

  activeRunTimer.pausedMs += Date.now() - activeRunTimer.pauseStartedAtMs
  activeRunTimer.pauseStartedAtMs = undefined
}

export async function runPromptWithPausedTimer<T>(prompt: () => Promise<T>): Promise<T> {
  pauseRunTimer()
  try {
    return await prompt()
  } finally {
    resumeRunTimer()
  }
}

export function resolveInvocationLabel(argv: string[]): string {
  const commandToken = argv.find((entry) => !entry.startsWith('-'))
  if (commandToken) {
    return commandToken
  }
  if (argv.includes('-u') || argv.includes('--update')) {
    return 'update'
  }
  if (argv.includes('-h') || argv.includes('--help')) {
    return 'help'
  }
  return 'check'
}

export function writeSectionTitle(title: string): void {
  const color = createColorizer()
  process.stdout.write(`${color.bold(title)}\n`)
}

export function writeSubtleInfo(text: string): void {
  const color = createColorizer()
  process.stdout.write(color.dim(text))
}

export function writeRunContextHeader(
  cwd: string,
  commandLabel: string,
  configPath: string | undefined,
  storedSnapshots: Map<string, StoredSnapshot>
): void {
  if (!shouldShowRunLogs()) {
    return
  }

  const color = createColorizer()
  process.stdout.write(color.bold(`eslint-config-snapshot v${readCliVersion()} • ${formatCommandDisplayLabel(commandLabel)}\n`))
  process.stdout.write(`📁 Repository: ${cwd}\n`)
  process.stdout.write(`📁 Baseline: ${formatStoredSnapshotSummary(storedSnapshots)}\n`)
  process.stdout.write(`⚙️ Config source: ${formatConfigSource(cwd, configPath)}\n`)
  process.stdout.write('\n')
}

export function writeEslintVersionSummary(eslintVersionsByGroup: GroupEslintVersions): void {
  if (!shouldShowRunLogs() || eslintVersionsByGroup.size === 0) {
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
    process.stdout.write(`- 🧩 eslint runtime: ${sortedAllVersions[0]} (all groups)\n`)
    return
  }

  process.stdout.write('- 🧩 eslint runtime by group:\n')
  const sortedEntries = [...eslintVersionsByGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [groupName, versions] of sortedEntries) {
    process.stdout.write(`  - ${groupName}: ${versions.join(', ')}\n`)
  }
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
