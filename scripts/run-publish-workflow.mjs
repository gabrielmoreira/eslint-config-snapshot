import { spawnSync } from 'node:child_process'

function run(command, commandArguments, options = {}) {
  const result = spawnSync(command, commandArguments, {
    stdio: 'inherit',
    ...options
  })
  return result.status ?? 1
}

function readOutput(command, commandArguments) {
  const result = spawnSync(command, commandArguments, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.status !== 0) {
    return
  }
  return (result.stdout ?? '').trim()
}

function hasGhCli() {
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  return spawnSync('gh', ['--version'], { stdio: 'ignore' }).status === 0
}

function currentBranch() {
  return readOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'main'
}

function currentVersionLabel() {
  const version = readOutput('node', ['-p', "require('./package.json').version"])
  if (!version) {
    return
  }
  return `v${version}`
}

function parseArguments(argv) {
  const parsed = {
    ref: currentBranch(),
    watch: false,
    watchLatest: false,
    label: currentVersionLabel()
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--watch') {
      parsed.watch = true
      continue
    }
    if (token === '--watch-latest') {
      parsed.watchLatest = true
      continue
    }
    if (token === '--ref') {
      const next = argv[index + 1]
      if (!next) {
        throw new Error('Missing value for --ref')
      }
      parsed.ref = next
      index += 1
      continue
    }
    if (token === '--label') {
      const next = argv[index + 1]
      if (!next) {
        throw new Error('Missing value for --label')
      }
      parsed.label = next
      index += 1
    }
  }
  return parsed
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function findLatestRunId(reference) {
  return readOutput('gh', [
    'run',
    'list',
    '--workflow',
    'publish-npm.yml',
    '--branch',
    reference,
    '--limit',
    '1',
    '--json',
    'databaseId',
    '--jq',
    '.[0].databaseId'
  ])
}

async function resolveLatestRunId(reference) {
  const maxAttempts = 15
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const runId = findLatestRunId(reference)
    if (runId && runId.length > 0) {
      return runId
    }
    await sleep(2000)
  }
  throw new Error('Could not resolve latest workflow run ID for publish-npm.yml.')
}

async function main() {
  if (!hasGhCli()) {
    throw new Error('GitHub CLI (gh) not found. Install gh and run `gh auth login` first.')
  }

  const commandArguments = parseArguments(process.argv.slice(2))
  if (run('gh', ['auth', 'status']) !== 0) {
    throw new Error('GitHub CLI is not authenticated. Run `gh auth login` first.')
  }

  console.log(`Dispatching Publish to npm workflow on ref "${commandArguments.ref}"...`)
  const dispatchArguments = ['workflow', 'run', 'publish-npm.yml', '--ref', commandArguments.ref]
  if (commandArguments.label && commandArguments.label.length > 0) {
    dispatchArguments.push('-f', `release_label=${commandArguments.label}`)
  }
  if (run('gh', dispatchArguments) !== 0) {
    throw new Error('Failed to dispatch publish workflow.')
  }

  if (commandArguments.watchLatest) {
    console.log('Resolving latest workflow run id...')
    const runId = await resolveLatestRunId(commandArguments.ref)
    console.log(`Watching workflow run ${runId}...`)
    if (run('gh', ['run', 'watch', runId, '--exit-status']) !== 0) {
      throw new Error('Failed while watching workflow run by id.')
    }
  } else if (commandArguments.watch) {
    console.log('Watching workflow runs...')
    if (run('gh', ['run', 'watch']) !== 0) {
      throw new Error('Failed while watching workflow run.')
    }
  }

  console.log('Workflow dispatched. Use `gh run list --workflow publish-npm.yml` to follow progress.')
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}
