import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { canonicalizeJson, compareSeverity, sortUnique } from '@eslint-config-snapshotter/core'

import type { NormalizedRuleEntry } from '@eslint-config-snapshotter/extract'

export type SnapshotFile = {
  formatVersion: 1
  groupId: string
  workspaces: string[]
  rules: Record<string, NormalizedRuleEntry>
}

export function aggregateRules(ruleMaps: readonly Map<string, NormalizedRuleEntry>[]): Map<string, NormalizedRuleEntry> {
  const aggregated = new Map<string, NormalizedRuleEntry>()

  for (const rules of ruleMaps) {
    for (const [ruleName, nextEntry] of rules.entries()) {
      const currentEntry = aggregated.get(ruleName)
      if (!currentEntry) {
        aggregated.set(ruleName, canonicalizeJson(nextEntry))
        continue
      }

      const severityCmp = compareSeverity(nextEntry[0], currentEntry[0])
      if (severityCmp > 0) {
        aggregated.set(ruleName, canonicalizeJson(nextEntry))
        continue
      }

      if (severityCmp < 0) {
        continue
      }

      const currentOptions = currentEntry.length > 1 ? canonicalizeJson(currentEntry[1]) : undefined
      const nextOptions = nextEntry.length > 1 ? canonicalizeJson(nextEntry[1]) : undefined

      if (JSON.stringify(currentOptions) !== JSON.stringify(nextOptions)) {
        throw new Error(`Conflicting rule options for ${ruleName} at severity ${currentEntry[0]}`)
      }
    }
  }

  return new Map([...aggregated.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

export function buildSnapshot(groupId: string, workspaces: readonly string[], rules: Map<string, NormalizedRuleEntry>): SnapshotFile {
  const sortedRules = [...rules.entries()].sort(([a], [b]) => a.localeCompare(b))
  const rulesObject: Record<string, NormalizedRuleEntry> = {}

  for (const [name, config] of sortedRules) {
    rulesObject[name] = canonicalizeJson(config)
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
