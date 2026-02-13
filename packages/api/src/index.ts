export { canonicalizeJson, compareSeverity, normalizePath, normalizeSeverity, sortUnique } from './core.js'
export type { JsonPrimitive, JsonValue } from './core.js'

export { assignGroupsByMatch, discoverWorkspaces } from './workspace.js'
export type { GroupAssignment, GroupDefinition, WorkspaceDiscovery, WorkspaceInput } from './workspace.js'

export { sampleWorkspaceFiles } from './sampling.js'
export type { SamplingConfig } from './sampling.js'

export { extractRulesForWorkspaceSamples, extractRulesFromPrintConfig, resolveEslintBinForWorkspace } from './extract.js'
export type { ExtractedWorkspaceRules, NormalizedRuleEntry, WorkspaceExtractionResult } from './extract.js'

export { aggregateRules, buildSnapshot, readSnapshotFile, writeSnapshotFile } from './snapshot.js'
export type { SnapshotFile } from './snapshot.js'

export { diffSnapshots, hasDiff } from './diff.js'
export type { RuleOptionChange, RuleSeverityChange, SnapshotDiff, WorkspaceMembershipChange } from './diff.js'

export { DEFAULT_CONFIG, findConfigPath, getConfigScaffold, loadConfig } from './config.js'
export type { ConfigPreset, SnapshotConfig } from './config.js'
