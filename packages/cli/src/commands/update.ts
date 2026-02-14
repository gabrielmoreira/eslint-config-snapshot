import { findConfigPath } from '@eslint-config-snapshot/api'
import path from 'node:path'

import { countUniqueWorkspaces, formatBaselineSummaryLines, summarizeSnapshots } from '../formatters.js'
import { writeEslintVersionSummary, writeRunContextHeader } from '../run-context.js'
import { computeCurrentSnapshots, loadStoredSnapshots, resolveGroupEslintVersions, type SkippedWorkspace, writeSnapshots } from '../runtime.js'
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
  const skippedWorkspaces: SkippedWorkspace[] = []
  let discoveredWorkspaces: string[] = []
  try {
    currentSnapshots = await computeCurrentSnapshots(cwd, {
      allowWorkspaceExtractionFailure: !foundConfig,
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

function writeSkippedWorkspaceSummary(
  terminal: TerminalIO,
  cwd: string,
  configPath: string | undefined,
  skippedWorkspaces: SkippedWorkspace[]
): void {
  if (skippedWorkspaces.length === 0) {
    return
  }

  terminal.warning(
    `Heads up: ${skippedWorkspaces.length} workspace(s) were skipped because ESLint auto-discovery could not extract an effective config for them.\n`
  )
  terminal.subtle(formatScopedConfigHint(cwd, configPath))
}

function writeDiscoveredWorkspacesSummary(terminal: TerminalIO, workspacesRel: string[]): void {
  if (workspacesRel.length === 0) {
    terminal.subtle('Auto-discovered workspaces: none\n')
    return
  }

  terminal.subtle(`Auto-discovered workspaces (${workspacesRel.length}): ${workspacesRel.join(', ')}\n`)
}

function formatScopedConfigHint(cwd: string, configPath: string | undefined): string {
  if (configPath && path.basename(configPath) === 'package.json') {
    return `Tip: if these workspaces are intentionally out of scope, add this under "eslint-config-snapshot" in package.json:\n{
  "sampling": {
    "excludeGlobs": [
      "packages/your-workspace/**"
    ]
  }
}\n`
  }

  if (configPath) {
    const relConfigPath = path.relative(cwd, configPath) || path.basename(configPath)
    return `Tip: if these workspaces are intentionally out of scope, add this in ${relConfigPath}:\n{
  sampling: {
    excludeGlobs: [
      'packages/your-workspace/**'
    ]
  }
}\n`
  }

  return `Tip: if these workspaces are intentionally out of scope, run \`eslint-config-snapshot init\` and add this config:\n{
  sampling: {
    excludeGlobs: [
      'packages/your-workspace/**'
    ]
  }
}\n`
}
