import { DEFAULT_CONFIG, findConfigPath, type SnapshotConfig } from '@eslint-config-snapshot/api'

import { countUniqueWorkspaces, formatBaselineSummaryLines, summarizeSnapshots } from '../formatters.js'
import { writeEslintVersionSummary, writeRunContextHeader } from '../run-context.js'
import { computeCurrentSnapshots, loadStoredSnapshots, resolveGroupEslintVersions, type SkippedWorkspace, writeSnapshots } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'
import { writeSkippedWorkspaceSummary } from './skipped-workspaces.js'

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
  const skippedWorkspaces: SkippedWorkspace[] = []
  let discoveredWorkspaces: string[] = []
  const allowWorkspaceExtractionFailure = !foundConfig || isDefaultEquivalentConfig(foundConfig.config)
  try {
    currentSnapshots = await computeCurrentSnapshots(cwd, {
      allowWorkspaceExtractionFailure,
      onWorkspacesDiscovered: (workspacesRel) => {
        discoveredWorkspaces = workspacesRel
      },
      onWorkspaceSkipped: (skipped) => {
        skippedWorkspaces.push(skipped)
      }
    })
  } catch (error: unknown) {
    if (!foundConfig && isWorkspaceDiscoveryDefaultsError(error)) {
      terminal.write(
        'Automatic workspace discovery could not complete with defaults.\nRun `eslint-config-snapshot init` to configure workspaces, then run `eslint-config-snapshot --update`.\n'
      )
      return 1
    }

    throw error
  }
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

function isWorkspaceDiscoveryDefaultsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Unable to discover workspaces') ||
    message.includes('Unmatched workspaces') ||
    message.includes('zero-config mode')
  )
}

function isDefaultEquivalentConfig(config: SnapshotConfig): boolean {
  return JSON.stringify(config) === JSON.stringify(DEFAULT_CONFIG)
}

function writeDiscoveredWorkspacesSummary(terminal: TerminalIO, workspacesRel: string[]): void {
  if (workspacesRel.length === 0) {
    terminal.subtle('Auto-discovered workspaces: none\n')
    return
  }

  terminal.subtle(`Auto-discovered workspaces (${workspacesRel.length}): ${workspacesRel.join(', ')}\n`)
}
