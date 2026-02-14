import { DEFAULT_CONFIG, findConfigPath, type SnapshotConfig } from '@eslint-config-snapshot/api'

import { writeRunContextHeader } from '../run-context.js'
import { type BuiltSnapshot, computeCurrentSnapshots, loadStoredSnapshots, type SkippedWorkspace, type StoredSnapshot } from '../runtime.js'
import { type TerminalIO } from '../terminal.js'

type SnapshotPreparationSuccess = {
  ok: true
  foundConfig: Awaited<ReturnType<typeof findConfigPath>>
  storedSnapshots: Map<string, StoredSnapshot>
  currentSnapshots: Map<string, BuiltSnapshot>
  discoveredWorkspaces: string[]
  skippedWorkspaces: SkippedWorkspace[]
}

type SnapshotPreparationFailure = {
  ok: false
  exitCode: number
}

export type SnapshotPreparationResult = SnapshotPreparationSuccess | SnapshotPreparationFailure

export async function prepareSnapshotExecution(options: {
  cwd: string
  snapshotDir: string
  terminal: TerminalIO
  commandLabel: string
  progressMessage: string
  showContext?: boolean
}): Promise<SnapshotPreparationResult> {
  const { cwd, snapshotDir, terminal, commandLabel, progressMessage, showContext = true } = options

  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd, snapshotDir)
  if (showContext) {
    writeRunContextHeader(terminal, cwd, commandLabel, foundConfig?.path, storedSnapshots)
  }
  if (showContext && terminal.showProgress && progressMessage.length > 0) {
    terminal.subtle(progressMessage)
  }

  if (showContext && !foundConfig) {
    terminal.subtle(
      'Tip: no explicit config found. Using safe built-in defaults. Run `eslint-config-snapshot init` to customize when needed.\n'
    )
  }

  const skippedWorkspaces: SkippedWorkspace[] = []
  let discoveredWorkspaces: string[] = []
  const allowWorkspaceExtractionFailure = !foundConfig || isDefaultEquivalentConfig(foundConfig.config)

  let currentSnapshots: Map<string, BuiltSnapshot>
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
    if (allowWorkspaceExtractionFailure && isWorkspaceDiscoveryDefaultsError(error)) {
      if (showContext) {
        terminal.write(
          'Automatic workspace discovery could not complete with defaults.\nRun `eslint-config-snapshot init` to configure workspaces, then run `eslint-config-snapshot --update`.\n'
        )
      }
      return { ok: false, exitCode: 1 }
    }

    throw error
  }

  return {
    ok: true,
    foundConfig,
    storedSnapshots,
    currentSnapshots,
    discoveredWorkspaces,
    skippedWorkspaces
  }
}

export function isWorkspaceDiscoveryDefaultsError(error: unknown): boolean {
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
