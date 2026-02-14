import { formatShortCatalog, type RuleEntry, type RuleObject, type UsageStats } from '../formatters.js'
import { resolveGroupRuleCatalogs } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'
import { writeDiscoveredWorkspacesSummary, writeSkippedWorkspaceSummary } from './skipped-workspaces.js'
import { prepareSnapshotExecution } from './snapshot-executor.js'

export type CatalogFormat = 'json' | 'short'

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

export async function executeCatalog(
  cwd: string,
  terminal: TerminalIO,
  snapshotDir: string,
  format: CatalogFormat,
  missingOnly: boolean
): Promise<number> {
  const prepared = await prepareSnapshotExecution({
    cwd,
    snapshotDir,
    terminal,
    commandLabel: `catalog:${format}`,
    progressMessage: '🔎 Checking current ESLint configuration...\n'
  })
  if (!prepared.ok) {
    return prepared.exitCode
  }

  const { foundConfig, currentSnapshots, discoveredWorkspaces, skippedWorkspaces } = prepared
  if (!foundConfig) {
    writeDiscoveredWorkspacesSummary(terminal, discoveredWorkspaces)
  }
  writeSkippedWorkspaceSummary(terminal, cwd, foundConfig?.path, skippedWorkspaces)

  const catalogs = await resolveGroupRuleCatalogs(cwd)
  const rows: CatalogRow[] = [...currentSnapshots.values()]
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
  return 0
}

function buildUsageStats(availableRules: string[], observedRules: RuleObject): UsageStats {
  let inUse = 0
  let active = 0
  let inactive = 0

  for (const ruleName of availableRules) {
    const observed = observedRules[ruleName]
    if (!observed) {
      continue
    }
    inUse += 1
    if (isRuleOffOnly(observed)) {
      inactive += 1
      continue
    }
    active += 1
  }

  const totalAvailable = availableRules.length
  const missing = Math.max(0, totalAvailable - inUse)
  return {
    totalAvailable,
    inUse,
    active,
    inactive,
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

function toPercent(value: number, total: number): number {
  if (total === 0) {
    return 0
  }
  return Number(((value / total) * 100).toFixed(1))
}
