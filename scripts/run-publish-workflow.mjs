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

function parseArguments(argv) {
  const parsed = {
    ref: currentBranch(),
    watch: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--watch') {
      parsed.watch = true
      continue
    }
    if (token === '--ref') {
      const next = argv[index + 1]
      if (!next) {
        throw new Error('Missing value for --ref')
      }
      parsed.ref = next
      index += 1
    }
  }
  return parsed
}

function main() {
  if (!hasGhCli()) {
    throw new Error('GitHub CLI (gh) not found. Install gh and run `gh auth login` first.')
  }

  const commandArguments = parseArguments(process.argv.slice(2))
  if (run('gh', ['auth', 'status']) !== 0) {
    throw new Error('GitHub CLI is not authenticated. Run `gh auth login` first.')
  }

  console.log(`Dispatching Publish to npm workflow on ref "${commandArguments.ref}"...`)
  if (run('gh', ['workflow', 'run', 'publish-npm.yml', '--ref', commandArguments.ref]) !== 0) {
    throw new Error('Failed to dispatch publish workflow.')
  }

  if (commandArguments.watch) {
    console.log('Watching workflow runs...')
    if (run('gh', ['run', 'watch']) !== 0) {
      throw new Error('Failed while watching workflow run.')
    }
  }

  console.log('Workflow dispatched. Use `gh run list --workflow publish-npm.yml` to follow progress.')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}
