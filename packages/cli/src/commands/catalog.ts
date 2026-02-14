import fg from 'fast-glob'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { formatShortCatalog, type RuleEntry, type RuleObject, type UsageStats } from '../formatters.js'
import { resolveGroupRuleCatalogs } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'
import { writeDiscoveredWorkspacesSummary, writeSkippedWorkspaceSummary } from './skipped-workspaces.js'
import { prepareSnapshotExecution } from './snapshot-executor.js'

export type CatalogFormat = 'json' | 'short'

const CATALOG_FILE_SUFFIX = '.catalog.json'

type CatalogRow = {
  groupId: string
  availableRules: string[]
  coreRules: string[]
  pluginRulesByPrefix: Record<string, string[]>
  observedRules: string[]
  missingRules: string[]
  observedOffRules: string[]
  observedActiveRules: string[]
  totalStats: UsageStats & { observedOutsideCatalog: number }
  coreStats: UsageStats
  pluginStats: Array<{ pluginId: string } & UsageStats>
}

type CatalogBaselineFile = CatalogRow & { formatVersion: 1 }

type CatalogCheckDiff = {
  groupId: string
  availableBefore: number
  availableAfter: number
  introducedAvailable: number
  removedAvailable: number
  inUseBefore: number
  inUseAfter: number
  errorBefore: number
  errorAfter: number
  warnBefore: number
  warnAfter: number
  offBefore: number
  offAfter: number
  activeBefore: number
  activeAfter: number
  inactiveBefore: number
  inactiveAfter: number
  missingBefore: number
  missingAfter: number
}

export async function executeCatalog(
  cwd: string,
  terminal: TerminalIO,
  snapshotDir: string,
  format: CatalogFormat,
  missingOnly: boolean
): Promise<number> {
  const rows = await computeCatalogRows(cwd, terminal, snapshotDir, `catalog:${format}`, true)

  if (format === 'short') {
    terminal.write(formatShortCatalog(rows, missingOnly))
    return 0
  }

  const output = rows.map((row) => {
    if (!missingOnly) {
      return row
    }

    return {
      groupId: row.groupId,
      totalStats: row.totalStats,
      coreStats: row.coreStats,
      pluginStats: row.pluginStats,
      missingRules: row.missingRules
    }
  })

  terminal.write(`${JSON.stringify(output, null, 2)}\n`)
  return rows.length === 0 ? 1 : 0
}

export async function executeCatalogUpdate(cwd: string, terminal: TerminalIO, snapshotDir: string): Promise<number> {
  const rows = await computeCatalogRows(cwd, terminal, snapshotDir, 'catalog:update', false)
  await writeCatalogBaselineFiles(cwd, snapshotDir, rows)

  const groups = rows.length
  const available = rows.reduce((sum, row) => sum + row.totalStats.totalAvailable, 0)
  const inUse = rows.reduce((sum, row) => sum + row.totalStats.inUse, 0)
  terminal.write(`🧪 Catalog baseline updated: ${groups} groups, ${available} available rules, ${inUse} currently in use.\n`)
  return 0
}

export async function executeCatalogCheck(cwd: string, terminal: TerminalIO, snapshotDir: string): Promise<number> {
  const rows = await computeCatalogRows(cwd, terminal, snapshotDir, 'catalog:check', false)
  const current = new Map(rows.map((row) => [row.groupId, row]))
  const stored = await loadCatalogBaselineFiles(cwd, snapshotDir)

  if (stored.size === 0) {
    terminal.write('No catalog baseline found yet.\n')
    terminal.write('Run `eslint-config-snapshot catalog-update` or `eslint-config-snapshot --update --experimental-with-catalog`.\n')
    return 1
  }

  const diffs = compareCatalogBaselines(stored, current)
  if (diffs.length === 0) {
    terminal.write('Great news: no catalog drift detected.\n')
    return 0
  }

  terminal.write(`⚠️ Heads up: catalog drift detected in ${diffs.length} groups.\n`)
  for (const diff of diffs) {
    terminal.write(
      [
        `group ${diff.groupId}`,
        `  available: ${diff.availableBefore} -> ${diff.availableAfter} (+${diff.introducedAvailable}/-${diff.removedAvailable})`,
        `  in use: ${diff.inUseBefore} -> ${diff.inUseAfter}`,
        `  severity: error ${diff.errorBefore} -> ${diff.errorAfter} | warn ${diff.warnBefore} -> ${diff.warnAfter} | off ${diff.offBefore} -> ${diff.offAfter}`,
        `  active: ${diff.activeBefore} -> ${diff.activeAfter}`,
        `  off: ${diff.inactiveBefore} -> ${diff.inactiveAfter}`,
        `  not used: ${diff.missingBefore} -> ${diff.missingAfter}`
      ].join('\n')
    )
    terminal.write('\n')
  }
  terminal.subtle('Tip: run `eslint-config-snapshot catalog-update` when you intentionally accept catalog changes.\n')
  return 1
}

async function computeCatalogRows(
  cwd: string,
  terminal: TerminalIO,
  snapshotDir: string,
  commandLabel: string,
  printDiscoverySummary: boolean
): Promise<CatalogRow[]> {
  const prepared = await prepareSnapshotExecution({
    cwd,
    snapshotDir,
    terminal,
    commandLabel,
    progressMessage: '🔎 Checking current ESLint configuration...\n'
  })
  if (!prepared.ok) {
    throw new Error(`Catalog operation aborted with exit code ${prepared.exitCode}`)
  }

  const { foundConfig, currentSnapshots, discoveredWorkspaces, skippedWorkspaces } = prepared
  if (!foundConfig && printDiscoverySummary) {
    writeDiscoveredWorkspacesSummary(terminal, discoveredWorkspaces)
  }
  if (printDiscoverySummary) {
    writeSkippedWorkspaceSummary(terminal, cwd, foundConfig?.path, skippedWorkspaces)
  }

  const catalogs = await resolveGroupRuleCatalogs(cwd)
  return [...currentSnapshots.values()]
    .map((snapshot) => {
      const observedRules = Object.keys(snapshot.rules).sort((a, b) => a.localeCompare(b))
      const catalog = catalogs.get(snapshot.groupId)
      const availableRules = catalog?.allRules ?? []
      const availableRuleSet = new Set(availableRules)
      const missingRules = availableRules.filter((ruleName) => !snapshot.rules[ruleName])
      const observedOffRules = observedRules.filter((ruleName) => isRuleOffOnly(snapshot.rules[ruleName]))
      const observedActiveRules = observedRules.filter((ruleName) => !isRuleOffOnly(snapshot.rules[ruleName]))
      const observedOutsideCatalog = observedRules.filter((ruleName) => !availableRuleSet.has(ruleName)).length

      const coreRules = catalog?.coreRules ?? []
      const coreStats = buildUsageStats(coreRules, snapshot.rules)
      const pluginRulesByPrefix = catalog?.pluginRulesByPrefix ?? {}
      const pluginStats = Object.entries(pluginRulesByPrefix)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([pluginId, rules]) => ({
          pluginId: pluginId.slice(0, -1),
          ...buildUsageStats(rules, snapshot.rules)
        }))

      const totalStats = {
        ...buildUsageStats(availableRules, snapshot.rules),
        observedOutsideCatalog
      }

      return {
        groupId: snapshot.groupId,
        availableRules,
        coreRules,
        pluginRulesByPrefix,
        observedRules,
        missingRules,
        observedOffRules,
        observedActiveRules,
        totalStats,
        coreStats,
        pluginStats
      }
    })
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
}

async function writeCatalogBaselineFiles(cwd: string, snapshotDir: string, rows: CatalogRow[]): Promise<void> {
  await mkdir(path.join(cwd, snapshotDir), { recursive: true })
  for (const row of rows) {
    const filePath = path.join(cwd, snapshotDir, `${row.groupId}${CATALOG_FILE_SUFFIX}`)
    await mkdir(path.dirname(filePath), { recursive: true })
    const payload: CatalogBaselineFile = {
      formatVersion: 1,
      ...row
    }
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }
}

async function loadCatalogBaselineFiles(cwd: string, snapshotDir: string): Promise<Map<string, CatalogBaselineFile>> {
  const dir = path.join(cwd, snapshotDir)
  const rawFiles = await fg(`**/*${CATALOG_FILE_SUFFIX}`, {
    cwd: dir,
    absolute: true,
    onlyFiles: true,
    dot: true,
    suppressErrors: true
  })

  const map = new Map<string, CatalogBaselineFile>()
  const sortedFiles = rawFiles.map(String).sort((a, b) => a.localeCompare(b))
  for (const filePath of sortedFiles) {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as CatalogBaselineFile
    map.set(parsed.groupId, parsed)
  }
  return map
}

function compareCatalogBaselines(
  before: Map<string, CatalogBaselineFile>,
  after: Map<string, CatalogRow>
): CatalogCheckDiff[] {
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b))
  const diffs: CatalogCheckDiff[] = []

  for (const id of ids) {
    const prev = before.get(id)
    const next = after.get(id)
    if (!prev || !next) {
      diffs.push({
        groupId: id,
        availableBefore: prev?.totalStats.totalAvailable ?? 0,
        availableAfter: next?.totalStats.totalAvailable ?? 0,
        introducedAvailable: next ? diffSet(next.availableRules, prev?.availableRules ?? []).length : 0,
        removedAvailable: prev ? diffSet(prev.availableRules, next?.availableRules ?? []).length : 0,
        inUseBefore: prev?.totalStats.inUse ?? 0,
        inUseAfter: next?.totalStats.inUse ?? 0,
        errorBefore: prev?.totalStats.error ?? 0,
        errorAfter: next?.totalStats.error ?? 0,
        warnBefore: prev?.totalStats.warn ?? 0,
        warnAfter: next?.totalStats.warn ?? 0,
        offBefore: prev?.totalStats.off ?? 0,
        offAfter: next?.totalStats.off ?? 0,
        activeBefore: prev?.totalStats.active ?? 0,
        activeAfter: next?.totalStats.active ?? 0,
        inactiveBefore: prev?.totalStats.inactive ?? 0,
        inactiveAfter: next?.totalStats.inactive ?? 0,
        missingBefore: prev?.totalStats.missing ?? 0,
        missingAfter: next?.totalStats.missing ?? 0
      })
      continue
    }

    const introduced = diffSet(next.availableRules, prev.availableRules).length
    const removed = diffSet(prev.availableRules, next.availableRules).length
    const changed =
      introduced > 0 ||
      removed > 0 ||
      prev.totalStats.inUse !== next.totalStats.inUse ||
      prev.totalStats.error !== next.totalStats.error ||
      prev.totalStats.warn !== next.totalStats.warn ||
      prev.totalStats.off !== next.totalStats.off ||
      prev.totalStats.active !== next.totalStats.active ||
      prev.totalStats.inactive !== next.totalStats.inactive ||
      prev.totalStats.missing !== next.totalStats.missing
    if (!changed) {
      continue
    }

    diffs.push({
      groupId: id,
      availableBefore: prev.totalStats.totalAvailable,
      availableAfter: next.totalStats.totalAvailable,
      introducedAvailable: introduced,
      removedAvailable: removed,
      inUseBefore: prev.totalStats.inUse,
      inUseAfter: next.totalStats.inUse,
      errorBefore: prev.totalStats.error,
      errorAfter: next.totalStats.error,
      warnBefore: prev.totalStats.warn,
      warnAfter: next.totalStats.warn,
      offBefore: prev.totalStats.off,
      offAfter: next.totalStats.off,
      activeBefore: prev.totalStats.active,
      activeAfter: next.totalStats.active,
      inactiveBefore: prev.totalStats.inactive,
      inactiveAfter: next.totalStats.inactive,
      missingBefore: prev.totalStats.missing,
      missingAfter: next.totalStats.missing
    })
  }

  return diffs
}

function diffSet(source: string[], target: string[]): string[] {
  const targetSet = new Set(target)
  return source.filter((item) => !targetSet.has(item))
}

function buildUsageStats(availableRules: string[], observedRules: RuleObject): UsageStats {
  let inUse = 0
  let active = 0
  let inactive = 0
  let error = 0
  let warn = 0
  let off = 0

  for (const ruleName of availableRules) {
    const observed = observedRules[ruleName]
    if (!observed) {
      continue
    }
    inUse += 1
    const severity = getPrimarySeverity(observed)
    if (severity === 'error') {
      error += 1
      active += 1
      continue
    }
    if (severity === 'warn') {
      warn += 1
      active += 1
      continue
    }
    off += 1
    inactive += 1
  }

  const totalAvailable = availableRules.length
  const missing = Math.max(0, totalAvailable - inUse)
  return {
    totalAvailable,
    inUse,
    active,
    inactive,
    error,
    warn,
    off,
    missing,
    inUsePct: toPercent(inUse, totalAvailable),
    activePctOfInUse: toPercent(active, inUse)
  }
}

function isRuleOffOnly(entry: RuleObject[string] | undefined): boolean {
  if (!entry) {
    return false
  }
  if (!Array.isArray(entry[0])) {
    return (entry as RuleEntry)[0] === 'off'
  }
  const variants = entry as RuleEntry[]
  return variants.every((variant) => variant[0] === 'off')
}

function getPrimarySeverity(entry: RuleObject[string]): 'error' | 'warn' | 'off' {
  if (!Array.isArray(entry[0])) {
    const single = entry as RuleEntry
    return single[0]
  }

  const variants = entry as RuleEntry[]
  if (variants.some((variant) => variant[0] === 'error')) {
    return 'error'
  }
  if (variants.some((variant) => variant[0] === 'warn')) {
    return 'warn'
  }
  return 'off'
}

function toPercent(value: number, total: number): number {
  if (total === 0) {
    return 0
  }
  return Number(((value / total) * 100).toFixed(1))
}
