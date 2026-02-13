import createDebug from 'debug'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { canonicalizeJson, normalizeSeverity } from './core.js'

const debugExtract = createDebug('eslint-config-snapshot:extract')

export type NormalizedRuleEntry = [severity: 'off' | 'warn' | 'error'] | [severity: 'off' | 'warn' | 'error', options: unknown]

export type ExtractedWorkspaceRules = Map<string, NormalizedRuleEntry>
export type WorkspaceExtractionResult = { fileAbs: string; rules?: ExtractedWorkspaceRules; error?: Error }

export function resolveEslintBinForWorkspace(workspaceAbs: string): string {
  const anchor = path.join(workspaceAbs, '__snapshot_anchor__.cjs')
  const req = createRequire(anchor)
  try {
    return req.resolve('eslint/bin/eslint.js')
  } catch {
    try {
      const eslintEntry = req.resolve('eslint')
      const eslintRoot = findPackageRoot(eslintEntry)
      const packageJsonPath = path.join(eslintRoot, 'package.json')
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { bin?: string | Record<string, string> }
      const relativeBin = resolveBinPath(packageJson.bin)
      const binAbs = path.resolve(eslintRoot, relativeBin)

      if (existsSync(binAbs)) {
        return binAbs
      }
    } catch {
      // ignore fallback errors and throw deterministic workspace-scoped message below
    }

    throw new Error(`Unable to resolve eslint from workspace: ${workspaceAbs}`)
  }
}

function resolveBinPath(bin: string | Record<string, string> | undefined): string {
  if (typeof bin === 'string') {
    return bin
  }

  if (typeof bin?.eslint === 'string') {
    return bin.eslint
  }

  return 'bin/eslint.js'
}

function findPackageRoot(entryAbs: string): string {
  let current = path.dirname(entryAbs)
  while (true) {
    const packageJsonPath = path.join(current, 'package.json')
    if (existsSync(packageJsonPath)) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error('Package root not found')
    }
    current = parent
  }
}

export function extractRulesFromPrintConfig(workspaceAbs: string, fileAbs: string): ExtractedWorkspaceRules {
  const eslintBin = resolveEslintBinForWorkspace(workspaceAbs)
  const commandArgs = [eslintBin, '--print-config', fileAbs]
  const startedAt = Date.now()
  debugExtract('spawn: cwd=%s cmd=%s %o', workspaceAbs, process.execPath, commandArgs)
  const proc = spawnSync(process.execPath, [eslintBin, '--print-config', fileAbs], {
    cwd: workspaceAbs,
    encoding: 'utf8'
  })
  debugExtract('spawn: done status=%s elapsedMs=%d', String(proc.status), Date.now() - startedAt)

  if (proc.status !== 0) {
    debugExtract('spawn: stderr=%s', proc.stderr.trim())
    throw new Error(`Failed to run eslint --print-config for ${fileAbs}`)
  }

  const stdout = proc.stdout.trim()
  if (stdout.length === 0 || stdout === 'undefined') {
    throw new Error(`Empty ESLint print-config output for ${fileAbs}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(`Invalid JSON from eslint --print-config for ${fileAbs}`)
  }

  const rules = (parsed as { rules?: Record<string, unknown> }).rules ?? {}
  return normalizeRules(rules)
}

export function resolveEslintVersionForWorkspace(workspaceAbs: string): string {
  const anchor = path.join(workspaceAbs, '__snapshot_anchor__.cjs')
  const req = createRequire(anchor)

  try {
    const packageJsonPath = req.resolve('eslint/package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string }
    if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
      return packageJson.version
    }
  } catch {
    // fall through to deterministic unknown marker
  }

  return 'unknown'
}

export async function extractRulesForWorkspaceSamples(
  workspaceAbs: string,
  fileAbsList: string[]
): Promise<WorkspaceExtractionResult[]> {
  debugExtract('workspace=%s sampleCount=%d', workspaceAbs, fileAbsList.length)
  const evaluate = await createWorkspaceEvaluator(workspaceAbs)
  const results: WorkspaceExtractionResult[] = []

  for (const fileAbs of fileAbsList) {
    try {
      const rules = await evaluate(fileAbs)
      results.push({ fileAbs, rules })
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error(String(error))
      debugExtract('extract failed: workspace=%s file=%s error=%s', workspaceAbs, fileAbs, normalizedError.message)
      results.push({ fileAbs, error: normalizedError })
    }
  }

  debugExtract(
    'workspace=%s extracted=%d failed=%d',
    workspaceAbs,
    results.filter((entry) => entry.rules !== undefined).length,
    results.filter((entry) => entry.error !== undefined).length
  )

  return results
}

async function createWorkspaceEvaluator(
  workspaceAbs: string
): Promise<(fileAbs: string) => Promise<ExtractedWorkspaceRules>> {
  try {
    const anchor = path.join(workspaceAbs, '__snapshot_anchor__.cjs')
    const req = createRequire(anchor)
    const eslintModuleEntry = req.resolve('eslint')
    const eslintModule = (await import(pathToFileURL(eslintModuleEntry).href)) as {
      ESLint?: new (options: { cwd: string }) => { calculateConfigForFile: (fileAbs: string) => Promise<{ rules?: Record<string, unknown> } | undefined> }
      default?: { ESLint?: new (options: { cwd: string }) => { calculateConfigForFile: (fileAbs: string) => Promise<{ rules?: Record<string, unknown> } | undefined> } }
    }

    const ESLintClass = eslintModule.ESLint ?? eslintModule.default?.ESLint
    if (ESLintClass) {
      debugExtract('workspace=%s evaluator=eslint-api', workspaceAbs)
      const eslint = new ESLintClass({ cwd: workspaceAbs })
      return async (fileAbs: string) => {
        const config = await eslint.calculateConfigForFile(fileAbs)
        if (!config || typeof config !== 'object') {
          throw new Error(`Empty ESLint print-config output for ${fileAbs}`)
        }

        return normalizeRules(config.rules ?? {})
      }
    }
  } catch {
    // fall through to subprocess-based extractor
  }

  debugExtract('workspace=%s evaluator=spawn-print-config', workspaceAbs)
  return (fileAbs: string) => Promise.resolve(extractRulesFromPrintConfig(workspaceAbs, fileAbs))
}

function normalizeRules(rules: Record<string, unknown>): ExtractedWorkspaceRules {
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
