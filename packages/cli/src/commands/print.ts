import { findConfigPath, loadConfig } from '@eslint-config-snapshot/api'

import { formatShortConfig, formatShortPrint } from '../output.js'
import { writeRunContextHeader } from '../presentation.js'
import { computeCurrentSnapshots, loadStoredSnapshots, resolveWorkspaceAssignments, type WorkspaceAssignments } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'

export type PrintFormat = 'json' | 'short'

export async function executePrint(cwd: string, terminal: TerminalIO, snapshotDir: string, format: PrintFormat): Promise<void> {
  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd, snapshotDir)
  writeRunContextHeader(terminal, cwd, `print:${format}`, foundConfig?.path, storedSnapshots)
  if (terminal.showProgress) {
    terminal.subtle('🔎 Checking current ESLint configuration...\n')
  }
  const currentSnapshots = await computeCurrentSnapshots(cwd)

  if (format === 'short') {
    terminal.write(formatShortPrint([...currentSnapshots.values()]))
    return
  }

  const output = [...currentSnapshots.values()].map((snapshot) => ({
    groupId: snapshot.groupId,
    rules: snapshot.rules
  }))
  terminal.write(`${JSON.stringify(output, null, 2)}\n`)
}

export async function executeConfig(cwd: string, terminal: TerminalIO, snapshotDir: string, format: PrintFormat): Promise<void> {
  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd, snapshotDir)
  writeRunContextHeader(terminal, cwd, `config:${format}`, foundConfig?.path, storedSnapshots)
  if (terminal.showProgress) {
    terminal.subtle('⚙️ Resolving effective runtime configuration...\n')
  }
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
    return
  }

  terminal.write(`${JSON.stringify(payload, null, 2)}\n`)
}
