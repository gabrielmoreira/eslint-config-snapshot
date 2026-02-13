import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { canonicalizeJson, normalizeSeverity } from '@eslint-config-snapshotter/core'

export type NormalizedRuleEntry = [severity: 'off' | 'warn' | 'error'] | [severity: 'off' | 'warn' | 'error', options: unknown]

export type ExtractedWorkspaceRules = Map<string, NormalizedRuleEntry>

export function resolveEslintBinForWorkspace(workspaceAbs: string): string {
  const anchor = path.join(workspaceAbs, '__snapshotter_anchor__.cjs')
  const req = createRequire(anchor)
  try {
    return req.resolve('eslint/bin/eslint.js')
  } catch {
    throw new Error(`Unable to resolve eslint from workspace: ${workspaceAbs}`)
  }
}

export function extractRulesFromPrintConfig(workspaceAbs: string, fileAbs: string): ExtractedWorkspaceRules {
  const eslintBin = resolveEslintBinForWorkspace(workspaceAbs)
  const proc = spawnSync(process.execPath, [eslintBin, '--print-config', fileAbs], {
    cwd: workspaceAbs,
    encoding: 'utf8'
  })

  if (proc.status !== 0) {
    throw new Error(`Failed to run eslint --print-config for ${fileAbs}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(proc.stdout)
  } catch {
    throw new Error(`Invalid JSON from eslint --print-config for ${fileAbs}`)
  }

  const rules = (parsed as { rules?: Record<string, unknown> }).rules ?? {}
  const normalized = new Map<string, NormalizedRuleEntry>()

  for (const [ruleName, ruleConfig] of Object.entries(rules)) {
    normalized.set(ruleName, normalizeRuleEntry(ruleConfig))
  }

  return normalized
}

function normalizeRuleEntry(raw: unknown): NormalizedRuleEntry {
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new Error('Rule configuration array cannot be empty')
    }

    const severity = normalizeSeverity(raw[0])
    const rest = raw.slice(1).map((item) => canonicalizeJson(item))

    if (rest.length === 0) {
      return [severity]
    }

    if (rest.length === 1) {
      return [severity, rest[0]]
    }

    return [severity, canonicalizeJson(rest)]
  }

  return [normalizeSeverity(raw)]
}
