import { canonicalizeJson, sortUnique } from './core.js'

import type { SnapshotFile } from './snapshot.js'

export type RuleSeverityChange = {
  rule: string
  before: string
  after: string
}

export type RuleOptionChange = {
  rule: string
  before: unknown
  after: unknown
}

export type WorkspaceMembershipChange = {
  added: string[]
  removed: string[]
}

export type SnapshotDiff = {
  introducedRules: string[]
  removedRules: string[]
  severityChanges: RuleSeverityChange[]
  optionChanges: RuleOptionChange[]
  workspaceMembershipChanges: WorkspaceMembershipChange
}

export function diffSnapshots(before: SnapshotFile, after: SnapshotFile): SnapshotDiff {
  const beforeRules = before.rules
  const afterRules = after.rules

  const beforeNames = Object.keys(beforeRules).sort()
  const afterNames = Object.keys(afterRules).sort()

  const introducedRules = afterNames.filter((name) => !beforeNames.includes(name))
  const removedRules = beforeNames.filter((name) => !afterNames.includes(name))

  const severityChanges: RuleSeverityChange[] = []
  const optionChanges: RuleOptionChange[] = []

  for (const name of beforeNames.filter((entry) => afterNames.includes(entry))) {
    const oldEntry = beforeRules[name]
    const newEntry = afterRules[name]

    if (oldEntry[0] !== newEntry[0]) {
      severityChanges.push({
        rule: name,
        before: oldEntry[0],
        after: newEntry[0]
      })
    }

    const oldOptions = oldEntry.length > 1 ? canonicalizeJson(oldEntry[1]) : undefined
    const newOptions = newEntry.length > 1 ? canonicalizeJson(newEntry[1]) : undefined

    if (oldEntry[0] === 'off' || newEntry[0] === 'off') {
      // Treat off->off option removal/addition as removed/introduced config intent.
      if (oldEntry[0] === 'off' && newEntry[0] === 'off') {
        if (oldOptions !== undefined && newOptions === undefined) {
          removedRules.push(name)
        } else if (oldOptions === undefined && newOptions !== undefined) {
          introducedRules.push(name)
        }
      }
      continue
    }

    if (JSON.stringify(oldOptions) !== JSON.stringify(newOptions)) {
      optionChanges.push({
        rule: name,
        before: oldOptions,
        after: newOptions
      })
    }
  }

  const beforeWorkspaces = sortUnique(before.workspaces)
  const afterWorkspaces = sortUnique(after.workspaces)

  return {
    introducedRules: sortUnique(introducedRules),
    removedRules: sortUnique(removedRules),
    severityChanges,
    optionChanges,
    workspaceMembershipChanges: {
      added: afterWorkspaces.filter((ws) => !beforeWorkspaces.includes(ws)),
      removed: beforeWorkspaces.filter((ws) => !afterWorkspaces.includes(ws))
    }
  }
}

export function hasDiff(diff: SnapshotDiff): boolean {
  return (
    diff.introducedRules.length > 0 ||
    diff.removedRules.length > 0 ||
    diff.severityChanges.length > 0 ||
    diff.optionChanges.length > 0 ||
    diff.workspaceMembershipChanges.added.length > 0 ||
    diff.workspaceMembershipChanges.removed.length > 0
  )
}
