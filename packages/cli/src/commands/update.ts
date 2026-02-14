import { findConfigPath } from '@eslint-config-snapshot/api'

import { countUniqueWorkspaces, summarizeSnapshots } from '../formatters.js'
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
        writeSkippedWorkspaceWarning(terminal, skipped)
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
  writeSkippedWorkspaceSummary(terminal, skippedWorkspaces)
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

function isWorkspaceDiscoveryDefaultsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Unable to discover workspaces') ||
    message.includes('Unmatched workspaces') ||
    message.includes('zero-config mode')
  )
}

function writeSkippedWorkspaceSummary(terminal: TerminalIO, skippedWorkspaces: SkippedWorkspace[]): void {
  if (skippedWorkspaces.length === 0) {
    return
  }

  terminal.subtle(`Skipped workspaces total: ${skippedWorkspaces.length}\n`)
  const suggestedExcludeGlobs = buildSuggestedExcludeGlobs(skippedWorkspaces)
  terminal.subtle(
    `Tip: if these workspaces are intentionally out of scope, consider adding this config:\n${formatSamplingExcludeHint(
      suggestedExcludeGlobs
    )}`
  )
}

function writeSkippedWorkspaceWarning(terminal: TerminalIO, skippedWorkspace: SkippedWorkspace): void {
  const shortenedReason = skippedWorkspace.reason.length > 120 ? `${skippedWorkspace.reason.slice(0, 117)}...` : skippedWorkspace.reason
  terminal.warning(
    `Warning: skipped workspace ${skippedWorkspace.workspaceRel} (group: ${skippedWorkspace.groupId}) due to extraction failure: ${shortenedReason}\n`
  )
}

function writeDiscoveredWorkspacesSummary(terminal: TerminalIO, workspacesRel: string[]): void {
  if (workspacesRel.length === 0) {
    terminal.subtle('Auto-discovered workspaces: none\n')
    return
  }

  terminal.subtle(`Auto-discovered workspaces (${workspacesRel.length}): ${workspacesRel.join(', ')}\n`)
}

function buildSuggestedExcludeGlobs(skippedWorkspaces: SkippedWorkspace[]): string[] {
  const unique = new Set<string>()
  for (const skippedWorkspace of skippedWorkspaces) {
    const normalizedWorkspace = trimTrailingSlashes(skippedWorkspace.workspaceRel.replaceAll('\\', '/'))
    unique.add(normalizedWorkspace === '' || normalizedWorkspace === '.' ? '**/*' : `${normalizedWorkspace}/**`)
  }
  return [...unique].sort((a, b) => a.localeCompare(b))
}

function formatSamplingExcludeHint(excludeGlobs: string[]): string {
  const lines = excludeGlobs.map((glob) => `      '${glob}',`).join('\n')
  return `{
  sampling: {
    excludeGlobs: [
${lines}
    ]
  }
}\n`
}

function trimTrailingSlashes(value: string): string {
  let result = value
  while (result.endsWith('/')) {
    result = result.slice(0, -1)
  }
  return result
}
