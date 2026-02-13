import type { SnapshotDiff, SnapshotRuleEntry } from '@eslint-config-snapshot/api'

export type RuleEntry = [severity: 'off' | 'warn' | 'error'] | [severity: 'off' | 'warn' | 'error', options: unknown]
export type RuleObject = Record<string, SnapshotRuleEntry>

export type SnapshotLike = {
  groupId: string
  workspaces: string[]
  rules: RuleObject
}

export function formatDiff(groupId: string, diff: SnapshotDiff): string {
  const lines = [`group: ${groupId}`]

  addListSection(lines, 'introduced rules', diff.introducedRules)
  addListSection(lines, 'removed rules', diff.removedRules)

  if (diff.severityChanges.length > 0) {
    lines.push('severity changed:')
    for (const change of diff.severityChanges) {
      lines.push(`  - ${change.rule}: ${change.before} -> ${change.after}`)
    }
  }

  const optionChanges = getDisplayOptionChanges(diff)
  if (optionChanges.length > 0) {
    lines.push('options changed:')
    for (const change of optionChanges) {
      lines.push(`  - ${change.rule}: ${formatValue(change.before)} -> ${formatValue(change.after)}`)
    }
  }

  addListSection(lines, 'workspaces added', diff.workspaceMembershipChanges.added)
  addListSection(lines, 'workspaces removed', diff.workspaceMembershipChanges.removed)

  return lines.join('\n')
}

export function getDisplayOptionChanges(diff: SnapshotDiff): SnapshotDiff['optionChanges'] {
  const removedRules = new Set(diff.removedRules)
  const severityChangedRules = new Set(diff.severityChanges.map((change) => change.rule))
  return diff.optionChanges.filter((change) => !removedRules.has(change.rule) && !severityChangedRules.has(change.rule))
}

function addListSection(lines: string[], title: string, values: string[]): void {
  if (values.length === 0) {
    return
  }

  lines.push(`${title}:`)
  for (const value of values) {
    lines.push(`  - ${value}`)
  }
}

function formatValue(value: unknown): string {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? 'undefined' : serialized
}

export function summarizeChanges(changes: Array<{ groupId: string; diff: SnapshotDiff }>) {
  let introduced = 0
  let removed = 0
  let severity = 0
  let options = 0
  let workspace = 0
  for (const change of changes) {
    introduced += change.diff.introducedRules.length
    removed += change.diff.removedRules.length
    severity += change.diff.severityChanges.length
    options += getDisplayOptionChanges(change.diff).length
    workspace += change.diff.workspaceMembershipChanges.added.length + change.diff.workspaceMembershipChanges.removed.length
  }
  return { introduced, removed, severity, options, workspace }
}

export function summarizeSnapshots(snapshots: Map<string, SnapshotLike>) {
  const { rules, error, warn, off } = countRuleSeverities([...snapshots.values()].map((snapshot) => snapshot.rules))
  return { groups: snapshots.size, rules, error, warn, off }
}

export function countUniqueWorkspaces(snapshots: Map<string, SnapshotLike>): number {
  const workspaces = new Set<string>()
  for (const snapshot of snapshots.values()) {
    for (const workspace of snapshot.workspaces) {
      workspaces.add(workspace)
    }
  }
  return workspaces.size
}

export function decorateDiffLine(
  line: string,
  color: { green: (text: string) => string; red: (text: string) => string; yellow: (text: string) => string }
): string {
  if (line.startsWith('introduced rules:') || line.startsWith('workspaces added:')) {
    return color.green(`+ ${line}`)
  }
  if (line.startsWith('removed rules:') || line.startsWith('workspaces removed:')) {
    return color.red(`- ${line}`)
  }
  if (line.startsWith('severity changed:') || line.startsWith('options changed:')) {
    return color.yellow(`~ ${line}`)
  }
  return line
}

export function createColorizer() {
  const enabled = process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'
  const wrap = (code: string, text: string) => (enabled ? `\u001B[${code}m${text}\u001B[0m` : text)
  return {
    green: (text: string) => wrap('32', text),
    yellow: (text: string) => wrap('33', text),
    red: (text: string) => wrap('31', text),
    bold: (text: string) => wrap('1', text),
    dim: (text: string) => wrap('2', text)
  }
}

export function formatShortPrint(snapshots: SnapshotLike[]): string {
  const lines: string[] = []
  const sorted = [...snapshots].sort((a, b) => a.groupId.localeCompare(b.groupId))

  for (const snapshot of sorted) {
    const ruleNames = Object.keys(snapshot.rules).sort()
    const severityCounts = { error: 0, warn: 0, off: 0 }

    for (const name of ruleNames) {
      const severity = getPrimarySeverity(snapshot.rules[name])
      if (severity) {
        severityCounts[severity] += 1
      }
    }

    lines.push(
      `group: ${snapshot.groupId}`,
      `workspaces (${snapshot.workspaces.length}): ${snapshot.workspaces.length > 0 ? snapshot.workspaces.join(', ') : '(none)'}`,
      `rules (${ruleNames.length}): error ${severityCounts.error}, warn ${severityCounts.warn}, off ${severityCounts.off}`
    )

    for (const ruleName of ruleNames) {
      const entry = snapshot.rules[ruleName]
      if (!entry) {
        continue
      }
      if (!Array.isArray(entry[0])) {
        const singleEntry = entry as RuleEntry
        const suffix = singleEntry.length > 1 ? ` ${JSON.stringify(singleEntry[1])}` : ''
        lines.push(`${ruleName}: ${singleEntry[0]}${suffix}`)
        continue
      }

      const variants = entry as RuleEntry[]
      lines.push(`${ruleName}: ${JSON.stringify(variants)}`)
    }
  }

  return `${lines.join('\n')}\n`
}

export function formatShortConfig(payload: {
  source: string
  workspaceInput: unknown
  workspaces: string[]
  grouping: { mode: string; allowEmptyGroups: boolean; groups: Array<{ name: string; workspaces: string[] }> }
  sampling: unknown
}): string {
  const lines: string[] = [
    `source: ${payload.source}`,
    `workspaces (${payload.workspaces.length}): ${payload.workspaces.join(', ') || '(none)'}`,
    `grouping mode: ${payload.grouping.mode} (allow empty: ${payload.grouping.allowEmptyGroups})`
  ]
  for (const group of payload.grouping.groups) {
    lines.push(`group ${group.name} (${group.workspaces.length}): ${group.workspaces.join(', ') || '(none)'}`)
  }
  lines.push(`workspaceInput: ${JSON.stringify(payload.workspaceInput)}`, `sampling: ${JSON.stringify(payload.sampling)}`)
  return `${lines.join('\n')}\n`
}

export function formatCommandDisplayLabel(commandLabel: string): string {
  switch (commandLabel) {
    case 'check':
    case 'check:summary': {
      return 'Check drift against baseline (summary)'
    }
    case 'check:diff': {
      return 'Check drift against baseline (detailed diff)'
    }
    case 'check:status': {
      return 'Check drift against baseline (status only)'
    }
    case 'update': {
      return 'Update baseline snapshot'
    }
    case 'print:json': {
      return 'Print aggregated rules (JSON)'
    }
    case 'print:short': {
      return 'Print aggregated rules (short view)'
    }
    case 'config:json': {
      return 'Show effective runtime config (JSON)'
    }
    case 'config:short': {
      return 'Show effective runtime config (short view)'
    }
    case 'init': {
      return 'Initialize local configuration'
    }
    case 'help': {
      return 'Show CLI help'
    }
    default: {
      return commandLabel
    }
  }
}

export function formatStoredSnapshotSummary(storedSnapshots: Map<string, SnapshotLike>): string {
  if (storedSnapshots.size === 0) {
    return 'none'
  }

  const summary = summarizeSnapshots(storedSnapshots)
  return `${summary.groups} groups, ${summary.rules} rules (severity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off)`
}

export function countRuleSeverities(ruleObjects: RuleObject[]) {
  let rules = 0
  let error = 0
  let warn = 0
  let off = 0

  for (const rulesObject of ruleObjects) {
    for (const entry of Object.values(rulesObject)) {
      rules += 1
      const severity = getPrimarySeverity(entry)
      if (severity === 'error') {
        error += 1
      } else if (severity === 'warn') {
        warn += 1
      } else {
        off += 1
      }
    }
  }

  return { rules, error, warn, off }
}

function getPrimarySeverity(entry: SnapshotRuleEntry | undefined): 'off' | 'warn' | 'error' | undefined {
  if (!entry) {
    return undefined
  }

  if (!Array.isArray(entry[0])) {
    return (entry as RuleEntry)[0]
  }

  const variants = entry as RuleEntry[]
  if (variants.some((variant) => variant[0] === 'error')) {
    return 'error'
  }
  if (variants.some((variant) => variant[0] === 'warn')) {
    return 'warn'
  }
  return 'off'
}
