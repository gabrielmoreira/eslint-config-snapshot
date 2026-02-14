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

    if (hasOffOnlyVariants(oldVariants) || hasOffOnlyVariants(newVariants)) {
      applyOffOnlyVariantDiff(name, oldVariants, newVariants, introducedRules, removedRules, optionChanges)
      continue
    }

    pushOptionChange(optionChanges, name, oldVariants, newVariants)
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

function hasOffOnlyVariants(variants: NormalizedRuleEntry[]): boolean {
  return variants.every((entry) => entry[0] === 'off')
}

function applyOffOnlyVariantDiff(
  ruleName: string,
  oldVariants: NormalizedRuleEntry[],
  newVariants: NormalizedRuleEntry[],
  introducedRules: string[],
  removedRules: string[],
  optionChanges: RuleOptionChange[]
): void {
  const oldIsOnlyOff = hasOffOnlyVariants(oldVariants)
  const newIsOnlyOff = hasOffOnlyVariants(newVariants)
  if (!oldIsOnlyOff || !newIsOnlyOff) {
    return
  }

  const oldHasOptions = hasAnyVariantOptions(oldVariants)
  const newHasOptions = hasAnyVariantOptions(newVariants)
  if (oldHasOptions && !newHasOptions) {
    removedRules.push(ruleName)
    return
  }
  if (!oldHasOptions && newHasOptions) {
    introducedRules.push(ruleName)
    return
  }
  if (oldVariants.length > newVariants.length) {
    removedRules.push(ruleName)
    return
  }
  if (oldVariants.length < newVariants.length) {
    introducedRules.push(ruleName)
    return
  }

  pushOptionChange(optionChanges, ruleName, oldVariants, newVariants)
}

function hasAnyVariantOptions(variants: NormalizedRuleEntry[]): boolean {
  return variants.some((variant) => variant.length > 1)
}

function pushOptionChange(
  optionChanges: RuleOptionChange[],
  rule: string,
  before: NormalizedRuleEntry[],
  after: NormalizedRuleEntry[]
): void {
  optionChanges.push({ rule, before, after })
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
