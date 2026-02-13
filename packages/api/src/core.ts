export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export function normalizePath(input: string): string {
  const withSlashes = input.replaceAll('\\', '/')
  const collapsed = withSlashes.replaceAll(/\/+/g, '/')
  const withoutTrailing = collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
  return withoutTrailing === '' ? '.' : withoutTrailing
}

export function sortUnique(list: readonly string[]): string[] {
  return [...new Set(list.map((item) => normalizePath(item)))].sort()
}

export function canonicalizeJson<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry)) as T
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const entry = record[key]
      if (entry !== undefined) {
        result[key] = canonicalizeJson(entry)
      }
    }
    return result as T
  }

  return value
}

export function compareSeverity(a: string, b: string): number {
  const rank: Record<string, number> = { off: 0, warn: 1, error: 2 }
  return rank[a] - rank[b]
}

export function normalizeSeverity(value: unknown): 'off' | 'warn' | 'error' {
  if (value === 0 || value === 'off') {
    return 'off'
  }
  if (value === 1 || value === 'warn') {
    return 'warn'
  }
  if (value === 2 || value === 'error') {
    return 'error'
  }
  throw new Error(`Unsupported severity: ${String(value)}`)
}
