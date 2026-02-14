import { loadConfig } from '@eslint-config-snapshot/api'

import { formatShortConfig, formatShortPrint } from '../formatters.js'
import { resolveWorkspaceAssignments, type WorkspaceAssignments } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'
import { prepareSnapshotExecution } from './snapshot-executor.js'

export type PrintFormat = 'json' | 'short'

export async function executePrint(cwd: string, terminal: TerminalIO, snapshotDir: string, format: PrintFormat): Promise<number> {
  const prepared = await prepareSnapshotExecution({
    cwd,
    snapshotDir,
    terminal,
    commandLabel: `print:${format}`,
    progressMessage: '🔎 Checking current ESLint configuration...\n'
  })
  if (!prepared.ok) {
    return prepared.exitCode
  }

  const { currentSnapshots } = prepared

  if (format === 'short') {
    terminal.write(formatShortPrint([...currentSnapshots.values()]))
    return 0
  }

  const output = [...currentSnapshots.values()].map((snapshot) => ({
    groupId: snapshot.groupId,
    rules: snapshot.rules
  }))
  terminal.write(`${JSON.stringify(output, null, 2)}\n`)
  return 0
}

export async function executeConfig(cwd: string, terminal: TerminalIO, snapshotDir: string, format: PrintFormat): Promise<number> {
  const prepared = await prepareSnapshotExecution({
    cwd,
    snapshotDir,
    terminal,
    commandLabel: `config:${format}`,
    progressMessage: '⚙️ Resolving effective runtime configuration...\n'
  })
  if (!prepared.ok) {
    return prepared.exitCode
  }

  const { foundConfig } = prepared
  const config = await loadConfig(cwd)
  const resolved: WorkspaceAssignments = await resolveWorkspaceAssignments(cwd, config)
  const payload = {
    source: foundConfig?.path ?? 'built-in-defaults',
    workspaceInput: config.workspaceInput,
    workspaces: resolved.discovery.workspacesRel,
    grouping: {
      mode: config.grouping.mode,
      allowEmptyGroups: config.grouping.allowEmptyGroups ?? false,
      groups: resolved.assignments.map((entry) => ({ name: entry.name, workspaces: entry.workspaces }))
    },
    sampling: config.sampling
  }

  if (format === 'short') {
    terminal.write(formatShortConfig(payload))
    return 0
  }

  terminal.write(`${JSON.stringify(payload, null, 2)}\n`)
  return 0
}
