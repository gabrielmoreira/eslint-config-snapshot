import { findConfigPath } from '@eslint-config-snapshot/api'

import { countUniqueWorkspaces, summarizeSnapshots } from '../formatters.js'
import { writeEslintVersionSummary, writeRunContextHeader } from '../run-context.js'
import { computeCurrentSnapshots, loadStoredSnapshots, resolveGroupEslintVersions, writeSnapshots } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'

export async function executeUpdate(cwd: string, terminal: TerminalIO, snapshotDir: string, printSummary: boolean): Promise<number> {
  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd, snapshotDir)
  writeRunContextHeader(terminal, cwd, 'update', foundConfig?.path, storedSnapshots)
  if (terminal.showProgress) {
    terminal.subtle('🔎 Checking current ESLint configuration...\n')
  }

  if (!foundConfig) {
    terminal.subtle(
      'Tip: no explicit config found. Using safe built-in defaults. Run `eslint-config-snapshot init` to customize when needed.\n'
    )
  }

  let currentSnapshots
  try {
    currentSnapshots = await computeCurrentSnapshots(cwd)
  } catch (error: unknown) {
    if (!foundConfig) {
      terminal.write(
        'Automatic workspace discovery could not complete with defaults.\nRun `eslint-config-snapshot init` to configure workspaces, then run `eslint-config-snapshot --update`.\n'
      )
      return 1
    }

    throw error
  }
  await writeSnapshots(cwd, snapshotDir, currentSnapshots)

  if (printSummary) {
    const summary = summarizeSnapshots(currentSnapshots)
    const workspaceCount = countUniqueWorkspaces(currentSnapshots)
    const eslintVersionsByGroup = terminal.showProgress ? await resolveGroupEslintVersions(cwd) : new Map<string, string[]>()
    terminal.section('📊 Summary')
    terminal.write(
      `Baseline updated: ${summary.groups} groups, ${summary.rules} rules.\nWorkspaces scanned: ${workspaceCount}.\nSeverity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off.\n`
    )
    writeEslintVersionSummary(terminal, eslintVersionsByGroup)
  }

  return 0
}
