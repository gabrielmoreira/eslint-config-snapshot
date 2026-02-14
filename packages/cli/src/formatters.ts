import type { SnapshotDiff, SnapshotRuleEntry } from '@eslint-config-snapshot/api'

export type RuleEntry = [severity: 'off' | 'warn' | 'error'] | [severity: 'off' | 'warn' | 'error', options: unknown]
export type RuleObject = Record<string, SnapshotRuleEntry>

export type SnapshotLike = {
  groupId: string
  workspaces: string[]
  rules: RuleObject
}
export type RuleCatalogLike = {
  groupId: string
  availableRules: string[]
  coreRules: string[]
  pluginRulesByPrefix: Record<string, string[]>
  observedRules: string[]
  observedRuleLevels: Record<string, 'error' | 'warn' | 'off'>
  missingRules: string[]
  observedOffRules: string[]
  observedActiveRules: string[]
  totalStats: UsageStats & { observedOutsideCatalog: number }
  coreStats: UsageStats
  pluginStats: Array<{ pluginId: string } & UsageStats>
}
type CatalogColorizer = {
  green: (text: string) => string
  yellow: (text: string) => string
  cyan: (text: string) => string
}

export type UsageStats = {
  totalAvailable: number
  inUse: number
  active: number
  inactive: number
  error: number
  warn: number
  off: number
  missing: number
  inUsePct: number
  activePctOfInUse: number
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
  const { rules, error, warn, off } = countUniqueRuleSeverities([...snapshots.values()].map((snapshot) => snapshot.rules))
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

export function formatShortPrint(snapshots: SnapshotLike[]): string {
  const lines: string[] = []
  const sorted = [...snapshots].sort((a, b) => a.groupId.localeCompare(b.groupId))

  for (const snapshot of sorted) {
    appendShortSnapshotSection(lines, snapshot)
  }

  return `${lines.join('\n')}\n`
}

function appendShortSnapshotSection(lines: string[], snapshot: SnapshotLike): void {
  const ruleNames = Object.keys(snapshot.rules).sort()
  const severityCounts = countRuleNameSeverities(ruleNames, snapshot.rules)
  lines.push(
    `group: ${snapshot.groupId}`,
    `workspaces (${snapshot.workspaces.length}): ${snapshot.workspaces.length > 0 ? snapshot.workspaces.join(', ') : '(none)'}`,
    `rules (${ruleNames.length}): error ${severityCounts.error}, warn ${severityCounts.warn}, off ${severityCounts.off}`
  )

  for (const ruleName of ruleNames) {
    const line = formatShortRuleLine(ruleName, snapshot.rules[ruleName])
    if (line) {
      lines.push(line)
    }
  }
}

function countRuleNameSeverities(
  ruleNames: string[],
  rules: RuleObject
): {
  error: number
  warn: number
  off: number
} {
  const counts = { error: 0, warn: 0, off: 0 }
  for (const name of ruleNames) {
    const severity = getPrimarySeverity(rules[name])
    if (severity) {
      counts[severity] += 1
    }
  }
  return counts
}

function formatShortRuleLine(ruleName: string, entry: SnapshotRuleEntry | undefined): string | undefined {
  if (!entry) {
    return undefined
  }

  if (!Array.isArray(entry[0])) {
    const singleEntry = entry as RuleEntry
    const suffix = singleEntry.length > 1 ? ` ${JSON.stringify(singleEntry[1])}` : ''
    return `${ruleName}: ${singleEntry[0]}${suffix}`
  }

  const variants = entry as RuleEntry[]
  return `${ruleName}: ${JSON.stringify(variants)}`
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

export function formatShortCatalog(
  catalogs: RuleCatalogLike[],
  options: { missingOnly: boolean; detailed: boolean; color?: CatalogColorizer }
): string {
  const { missingOnly, detailed, color } = options
  const lines: string[] = []
  const sorted = [...catalogs].sort((a, b) => a.groupId.localeCompare(b.groupId))
  const showGroupHeader = sorted.length > 1 || sorted.some((catalog) => catalog.groupId !== 'default')
  for (const catalog of sorted) {
    if (showGroupHeader) {
      lines.push(`🧭 group: ${catalog.groupId}`)
    }
    lines.push(
      `📦 total: ${formatUsageLine(catalog.totalStats)} | outside catalog observed: ${catalog.totalStats.observedOutsideCatalog}`,
      `🧱 core: ${formatUsageLine(catalog.coreStats)}`,
      `🔌 plugins tracked: ${catalog.pluginStats.length}`
    )
    for (const plugin of catalog.pluginStats) {
      lines.push(`  - ${plugin.pluginId}: ${formatUsageLine(plugin)}`)
    }

    if (detailed) {
      appendRuleStateGroups(lines, catalog, missingOnly, color)
    }
    if (showGroupHeader) {
      lines.push('')
    }
  }
  if (showGroupHeader && lines.at(-1) === '') {
    lines.pop()
  }
  return `${lines.join('\n')}\n`
}

function formatUsageLine(stats: UsageStats): string {
  return `${stats.inUse}/${stats.totalAvailable} in use (${stats.inUsePct}%) | error ${stats.error} | warn ${stats.warn} | off ${stats.off} | not used ${stats.missing}`
}

function appendRuleStateGroups(
  lines: string[],
  catalog: RuleCatalogLike,
  missingOnly: boolean,
  color?: CatalogColorizer
): void {
  if (missingOnly) {
    appendRuleList(lines, color?.yellow('🟡 unused') ?? '🟡 unused', catalog.missingRules)
    return
  }

  const observedRuleSet = new Set(catalog.observedRules)
  const errorRules: string[] = []
  const warnRules: string[] = []
  const offRules: string[] = []
  const unusedRules: string[] = []

  for (const ruleName of catalog.availableRules) {
    if (!observedRuleSet.has(ruleName)) {
      unusedRules.push(ruleName)
      continue
    }
    const level = catalog.observedRuleLevels[ruleName]
    if (level === 'off') {
      offRules.push(ruleName)
      continue
    }
    if (level === 'error') {
      errorRules.push(ruleName)
      continue
    }
    warnRules.push(ruleName)
  }

  appendRuleList(lines, color?.green('🟢 error') ?? '🟢 error', errorRules)
  appendRuleList(lines, color?.green('🟢 warn') ?? '🟢 warn', warnRules)
  appendRuleList(lines, color?.cyan('🔵 off') ?? '🔵 off', offRules)
  appendRuleList(lines, color?.yellow('🟡 unused') ?? '🟡 unused', unusedRules)
}

function appendRuleList(lines: string[], label: string, rules: string[]): void {
  lines.push(`${label} (${rules.length}):`)
  const sortedRules = [...rules].sort((a, b) => a.localeCompare(b))
  for (const ruleName of sortedRules) {
    lines.push(`  - ${ruleName}`)
  }
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
    case 'catalog:json': {
      return 'Show discovered rule catalog (JSON)'
    }
    case 'catalog:short': {
      return 'Show discovered rule catalog (short view)'
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

export function formatBaselineSummaryLines(
  summary: { groups: number; rules: number; error: number; warn: number; off: number },
  workspaceCount: number
): string {
  return `- 📦 baseline: ${summary.groups} groups, ${summary.rules} rules\n- 🗂️ workspaces scanned: ${workspaceCount}\n- 🎚️ severity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off\n`
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

export function countUniqueRuleSeverities(ruleObjects: RuleObject[]) {
  const severityRank: Record<'off' | 'warn' | 'error', number> = { off: 0, warn: 1, error: 2 }
  const severityByRule = new Map<string, 'off' | 'warn' | 'error'>()

  for (const rulesObject of ruleObjects) {
    for (const [ruleName, entry] of Object.entries(rulesObject)) {
      const nextSeverity = getPrimarySeverity(entry)
      if (!nextSeverity) {
        continue
      }
      const currentSeverity = severityByRule.get(ruleName)
      if (!currentSeverity || severityRank[nextSeverity] > severityRank[currentSeverity]) {
        severityByRule.set(ruleName, nextSeverity)
      }
    }
  }

  let error = 0
  let warn = 0
  let off = 0
  for (const severity of severityByRule.values()) {
    if (severity === 'error') {
      error += 1
    } else if (severity === 'warn') {
      warn += 1
    } else {
      off += 1
    }
  }

  return { rules: severityByRule.size, error, warn, off }
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
