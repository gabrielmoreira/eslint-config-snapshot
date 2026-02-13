import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { canonicalizeJson, compareSeverity, sortUnique } from './core.js'

import type { NormalizedRuleEntry } from './extract.js'

export type SnapshotRuleEntry = NormalizedRuleEntry | NormalizedRuleEntry[]

export type SnapshotFile = {
  formatVersion: 1
  groupId: string
  workspaces: string[]
  rules: Record<string, SnapshotRuleEntry>
}

export function aggregateRules(ruleMaps: readonly Map<string, NormalizedRuleEntry>[]): Map<string, SnapshotRuleEntry> {
  const aggregated = new Map<string, Map<string, NormalizedRuleEntry>>()

  for (const rules of ruleMaps) {
    for (const [ruleName, nextEntry] of rules.entries()) {
      const normalizedEntry = canonicalizeJson(nextEntry)
      const variantKey = toVariantKey(normalizedEntry)
      const variants = aggregated.get(ruleName) ?? new Map<string, NormalizedRuleEntry>()
      variants.set(variantKey, normalizedEntry)
      aggregated.set(ruleName, variants)
    }
  }

  const entries = [...aggregated.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map<[string, SnapshotRuleEntry]>(([ruleName, variants]) => {
      const sortedVariants = [...variants.values()].sort(compareVariants)
      if (sortedVariants.length === 1) {
        return [ruleName, sortedVariants[0]]
      }

      return [ruleName, sortedVariants]
    })

  return new Map(entries)
}

export function buildSnapshot(groupId: string, workspaces: readonly string[], rules: Map<string, SnapshotRuleEntry>): SnapshotFile {
  const sortedRules = [...rules.entries()].sort(([a], [b]) => a.localeCompare(b))
  const rulesObject: Record<string, SnapshotRuleEntry> = {}

  for (const [name, config] of sortedRules) {
    rulesObject[name] = isSingleRuleEntry(config)
      ? canonicalizeJson(config)
      : config.map((variant) => canonicalizeJson(variant)).sort(compareVariants)
  }

  return {
    formatVersion: 1,
    groupId,
    workspaces: sortUnique(workspaces),
    rules: rulesObject
  }
}

export async function writeSnapshotFile(snapshotDirAbs: string, snapshot: SnapshotFile): Promise<string> {
  await mkdir(snapshotDirAbs, { recursive: true })
  const filePath = path.join(snapshotDirAbs, `${snapshot.groupId}.json`)
  await mkdir(path.dirname(filePath), { recursive: true })
  const payload = JSON.stringify(snapshot, null, 2)
  await writeFile(filePath, `${payload}\n`, 'utf8')
  return filePath
}

export async function readSnapshotFile(fileAbs: string): Promise<SnapshotFile> {
  const raw = await readFile(fileAbs, 'utf8')
  return JSON.parse(raw) as SnapshotFile
}

function toVariantKey(entry: NormalizedRuleEntry): string {
  return JSON.stringify(canonicalizeJson(entry))
}

function compareVariants(a: NormalizedRuleEntry, b: NormalizedRuleEntry): number {
  const severityCompare = compareSeverity(b[0], a[0])
  if (severityCompare !== 0) {
    return severityCompare
  }

  const aJson = JSON.stringify(canonicalizeJson(a))
  const bJson = JSON.stringify(canonicalizeJson(b))
  return aJson.localeCompare(bJson)
}

function isSingleRuleEntry(entry: SnapshotRuleEntry): entry is NormalizedRuleEntry {
  return !Array.isArray(entry[0])
}
