import { formatShortCatalog } from '../formatters.js'
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
      const missingRules = availableRules.filter((ruleName) => !snapshot.rules[ruleName])

      return {
        groupId: snapshot.groupId,
        availableRules,
        coreRules: catalog?.coreRules ?? [],
        pluginRulesByPrefix: catalog?.pluginRulesByPrefix ?? {},
        observedRules,
        missingRules
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
      missingRules: row.missingRules
    }
  })

  terminal.write(`${JSON.stringify(output, null, 2)}\n`)
  return 0
}
