import path from 'node:path'

import { type SkippedWorkspace } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'

export function writeDiscoveredWorkspacesSummary(terminal: TerminalIO, workspacesRel: string[]): void {
  if (workspacesRel.length === 0) {
    terminal.subtle('Auto-discovered workspaces: none\n')
    return
  }

  terminal.subtle(`Auto-discovered workspaces (${workspacesRel.length}): ${workspacesRel.join(', ')}\n`)
}

export function writeSkippedWorkspaceSummary(
  terminal: TerminalIO,
  cwd: string,
  configPath: string | undefined,
  skippedWorkspaces: SkippedWorkspace[]
): void {
  if (skippedWorkspaces.length === 0) {
    return
  }

  const workspacePaths = collectSkippedWorkspacePaths(skippedWorkspaces)
  terminal.warning(
    `Heads up: ${workspacePaths.length} workspace(s) were skipped because ESLint auto-discovery could not extract an effective config for them.\n`
  )
  terminal.warning(`Skipped workspaces: ${workspacePaths.join(', ')}\n`)
  terminal.subtle(formatScopedConfigHint(cwd, configPath, workspacePaths))
}

function collectSkippedWorkspacePaths(skippedWorkspaces: SkippedWorkspace[]): string[] {
  const unique = new Set<string>()
  for (const skipped of skippedWorkspaces) {
    unique.add(skipped.workspaceRel)
  }

  return [...unique].sort()
}

function toExcludeGlobs(workspacePaths: string[]): string[] {
  return workspacePaths.map((workspacePath) => `${workspacePath}/**`)
}

function formatScopedConfigHint(cwd: string, configPath: string | undefined, workspacePaths: string[]): string {
  const excludeGlobs = toExcludeGlobs(workspacePaths)

  if (configPath && path.basename(configPath) === 'package.json') {
    return `Tip: if these workspaces are intentionally out of scope, add this under "eslint-config-snapshot" in package.json:\n${JSON.stringify(
      {
        sampling: {
          excludeGlobs
        }
      },
      null,
      2
    )}\n`
  }

  const objectLiteral = `{
  sampling: {
    excludeGlobs: [
${excludeGlobs.map((value) => `      '${value}'`).join(',\n')}
    ]
  }
}\n`

  if (configPath) {
    const relConfigPath = path.relative(cwd, configPath) || path.basename(configPath)
    return `Tip: if these workspaces are intentionally out of scope, add this in ${relConfigPath}:\n${objectLiteral}`
  }

  return `Tip: if these workspaces are intentionally out of scope, run \`eslint-config-snapshot init\` and add this config:\n${objectLiteral}`
}
