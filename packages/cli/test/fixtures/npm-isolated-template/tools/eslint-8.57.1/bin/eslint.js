#!/usr/bin/env node
const path = require('node:path')

let rules = {}
try {
  const loaded = require(path.join(process.cwd(), '.eslintrc.cjs'))
  rules = loaded && typeof loaded === 'object' ? (loaded.rules || {}) : {}
} catch {
  rules = {}
}

process.stdout.write(JSON.stringify({ rules }))
