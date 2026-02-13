import { canonicalizeJson, sortUnique } from './core.js'

import type { NormalizedRuleEntry } from './extract.js'
import type { SnapshotFile, SnapshotRuleEntry } from './snapshot.js'

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
    const oldVariants = toVariants(oldEntry)
    const newVariants = toVariants(newEntry)

    const oldSeverity = summarizeSeveritySet(oldVariants)
    const newSeverity = summarizeSeveritySet(newVariants)
    if (oldSeverity !== newSeverity) {
      severityChanges.push({
        rule: name,
        before: oldSeverity,
        after: newSeverity
      })
    }

    const oldSerialized = JSON.stringify(oldVariants)
    const newSerialized = JSON.stringify(newVariants)
    if (oldSerialized === newSerialized) {
      continue
    }

    const oldIsOnlyOff = oldVariants.every((entry) => entry[0] === 'off')
    const newIsOnlyOff = newVariants.every((entry) => entry[0] === 'off')
    if (oldIsOnlyOff || newIsOnlyOff) {
      // Treat off->off option removal/addition as removed/introduced config intent.
      if (oldIsOnlyOff && newIsOnlyOff) {
        const oldHasOptions = oldVariants.some((variant) => variant.length > 1)
        const newHasOptions = newVariants.some((variant) => variant.length > 1)
        if (oldHasOptions && !newHasOptions) {
          removedRules.push(name)
        } else if (!oldHasOptions && newHasOptions) {
          introducedRules.push(name)
        } else if (oldVariants.length > newVariants.length) {
          removedRules.push(name)
        } else if (oldVariants.length < newVariants.length) {
          introducedRules.push(name)
        } else {
          optionChanges.push({
            rule: name,
            before: oldVariants,
            after: newVariants
          })
        }
      }
      continue
    }

    optionChanges.push({
      rule: name,
      before: oldVariants,
      after: newVariants
    })
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

function toVariants(entry: SnapshotRuleEntry): NormalizedRuleEntry[] {
  if (!Array.isArray(entry[0])) {
    return [canonicalizeJson(entry as NormalizedRuleEntry)]
  }

  return (entry as NormalizedRuleEntry[]).map((variant) => canonicalizeJson(variant))
}

function summarizeSeveritySet(variants: NormalizedRuleEntry[]): string {
  const severityOrder: Array<'error' | 'warn' | 'off'> = ['error', 'warn', 'off']
  const severities = new Set(variants.map((variant) => variant[0]))
  return severityOrder.filter((severity) => severities.has(severity)).join('|')
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
