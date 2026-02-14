import { countUniqueWorkspaces, formatBaselineSummaryLines, summarizeSnapshots } from '../formatters.js'
import { writeEslintVersionSummary } from '../run-context.js'
import { resolveGroupEslintVersions, writeSnapshots } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'
import { writeDiscoveredWorkspacesSummary, writeSkippedWorkspaceSummary } from './skipped-workspaces.js'
import { prepareSnapshotExecution } from './snapshot-executor.js'

export async function executeUpdate(cwd: string, terminal: TerminalIO, snapshotDir: string, printSummary: boolean): Promise<number> {
  const prepared = await prepareSnapshotExecution({
    cwd,
    snapshotDir,
    terminal,
    commandLabel: 'update',
    progressMessage: '🔎 Checking current ESLint configuration...\n'
  })
  if (prepared.ok === false) {
    return prepared.exitCode
  }

  const { foundConfig, storedSnapshots, currentSnapshots, discoveredWorkspaces, skippedWorkspaces } = prepared
  if (!foundConfig) {
    writeDiscoveredWorkspacesSummary(terminal, discoveredWorkspaces)
  }
  writeSkippedWorkspaceSummary(terminal, cwd, foundConfig?.path, skippedWorkspaces)
  await writeSnapshots(cwd, snapshotDir, currentSnapshots)

  if (printSummary) {
    const summary = summarizeSnapshots(currentSnapshots)
    const workspaceCount = countUniqueWorkspaces(currentSnapshots)
    const eslintVersionsByGroup = terminal.showProgress ? await resolveGroupEslintVersions(cwd) : new Map<string, string[]>()
    const baselineAction = storedSnapshots.size === 0 ? 'created' : 'updated'
    terminal.success(`✅ Great news: baseline was successfully ${baselineAction} for your project.\n`)
    terminal.section('📊 Summary')
    terminal.write(formatBaselineSummaryLines(summary, workspaceCount))
    writeEslintVersionSummary(terminal, eslintVersionsByGroup)
  }

  return 0
}
