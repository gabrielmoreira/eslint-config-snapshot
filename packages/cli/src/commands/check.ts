import {
  countUniqueWorkspaces,
  decorateDiffLine,
  formatBaselineSummaryLines,
  formatDiff,
  summarizeChanges,
  summarizeSnapshots
} from '../formatters.js'
import { writeEslintVersionSummary } from '../run-context.js'
import {
  type BuiltSnapshot,
  compareSnapshotMaps,
  type GroupEslintVersions,
  resolveGroupEslintVersions,
  type SnapshotDiff,
  writeSnapshots
} from '../runtime.js'
import { type TerminalIO } from '../terminal.js'
import { writeDiscoveredWorkspacesSummary, writeSkippedWorkspaceSummary } from './skipped-workspaces.js'
import { prepareSnapshotExecution } from './snapshot-executor.js'

export type CheckFormat = 'summary' | 'status' | 'diff'

const UPDATE_HINT = 'Tip: when you intentionally accept changes, run `eslint-config-snapshot --update` to refresh the baseline.\n'

export async function executeCheck(
  cwd: string,
  format: CheckFormat,
  terminal: TerminalIO,
  snapshotDir: string,
  defaultInvocation = false
): Promise<number> {
  const isStatusFormat = format === 'status'
  const commandLabel = defaultInvocation ? 'check' : `check:${format}`
  const prepared = await prepareSnapshotExecution({
    cwd,
    snapshotDir,
    terminal,
    commandLabel: isStatusFormat ? 'check:status' : commandLabel,
    progressMessage: isStatusFormat ? '' : '🔎 Checking current ESLint configuration...\n',
    showContext: isStatusFormat === false
  })
  if (prepared.ok === false) {
    return prepared.exitCode
  }

  const { foundConfig, storedSnapshots, currentSnapshots, discoveredWorkspaces, skippedWorkspaces } = prepared
  if (foundConfig === null && isStatusFormat === false) {
    writeDiscoveredWorkspacesSummary(terminal, discoveredWorkspaces)
  }
  if (isStatusFormat === false) {
    writeSkippedWorkspaceSummary(terminal, cwd, foundConfig?.path, skippedWorkspaces)
  }
  if (storedSnapshots.size === 0) {
    const summary = summarizeSnapshots(currentSnapshots)
    terminal.write(
      `Rules found in this analysis: ${summary.groups} groups, ${summary.rules} rules (severity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off).\n`
    )

    const canPromptBaseline = defaultInvocation || format === 'summary'
    if (canPromptBaseline && terminal.isInteractive) {
      const shouldCreateBaseline = await terminal.askYesNo(
        'No baseline yet. Do you want to save this analyzed rule state as your baseline now? [Y/n] ',
        true
      )
      if (shouldCreateBaseline) {
        await writeSnapshots(cwd, snapshotDir, currentSnapshots)
        const createdSummary = summarizeSnapshots(currentSnapshots)
        terminal.write(`Great start: baseline created with ${createdSummary.groups} groups and ${createdSummary.rules} rules.\n`)
        terminal.subtle(UPDATE_HINT)
        return 0
      }
    }

    terminal.write('You are almost set: no baseline snapshot found yet.\n')
    terminal.write('Run `eslint-config-snapshot --update` to create your first baseline.\n')
    return 1
  }

  const changes = compareSnapshotMaps(storedSnapshots, currentSnapshots)
  const eslintVersionsByGroup = terminal.showProgress ? await resolveGroupEslintVersions(cwd) : new Map<string, string[]>()

  if (format === 'status') {
    if (changes.length === 0) {
      terminal.write('clean\n')
      return 0
    }

    terminal.write('changes\n')
    terminal.subtle(UPDATE_HINT)
    return 1
  }

  if (format === 'diff') {
    if (changes.length === 0) {
      terminal.write('Great news: no snapshot changes detected.\n')
      writeEslintVersionSummary(terminal, eslintVersionsByGroup)
      return 0
    }

    for (const change of changes) {
      terminal.write(`${formatDiff(change.groupId, change.diff)}\n`)
    }
    terminal.subtle(UPDATE_HINT)

    return 1
  }

  return printWhatChanged(terminal, changes, currentSnapshots, eslintVersionsByGroup)
}

function printWhatChanged(
  terminal: TerminalIO,
  changes: Array<{ groupId: string; diff: SnapshotDiff }>,
  currentSnapshots: Map<string, BuiltSnapshot>,
  eslintVersionsByGroup: GroupEslintVersions
): number {
  const color = terminal.colors
  const currentSummary = summarizeSnapshots(currentSnapshots)
  const workspaceCount = countUniqueWorkspaces(currentSnapshots)
  const changeSummary = summarizeChanges(changes)

  if (changes.length === 0) {
    terminal.write(color.green('✅ Great news: no snapshot drift detected.\n'))
    terminal.section('📊 Summary')
    terminal.write(formatBaselineSummaryLines(currentSummary, workspaceCount))
    writeEslintVersionSummary(terminal, eslintVersionsByGroup)
    return 0
  }

  terminal.write(color.red('⚠️ Heads up: snapshot drift detected.\n'))
  terminal.section('📊 Summary')
  terminal.write(
    `- changed groups: ${changes.length}\n- introduced rules: ${changeSummary.introduced}\n- removed rules: ${changeSummary.removed}\n- severity changes: ${changeSummary.severity}\n- options changes: ${changeSummary.options}\n- workspace membership changes: ${changeSummary.workspace}\n- 🗂️ workspaces scanned: ${workspaceCount}\n- current baseline: ${currentSummary.groups} groups, ${currentSummary.rules} rules\n- current severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off\n`
  )
  writeEslintVersionSummary(terminal, eslintVersionsByGroup)
  terminal.write('\n')

  terminal.section('🧾 Changes')
  for (const change of changes) {
    terminal.write(color.bold(`group ${change.groupId}\n`))
    const lines = formatDiff(change.groupId, change.diff).split('\n').slice(1)
    for (const line of lines) {
      const decorated = decorateDiffLine(line, color)
      terminal.write(`${decorated}\n`)
    }
    terminal.write('\n')
  }
  terminal.subtle(UPDATE_HINT)

  return 1
}
