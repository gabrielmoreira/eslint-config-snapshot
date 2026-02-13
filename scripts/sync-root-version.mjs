import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDirectory = path.resolve(__dirname, '..')

const rootPackagePath = path.join(rootDirectory, 'package.json')
const cliPackagePath = path.join(rootDirectory, 'packages', 'cli', 'package.json')
const apiPackagePath = path.join(rootDirectory, 'packages', 'api', 'package.json')

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function assertVersion(packageJson, packageName) {
  if (typeof packageJson.version !== 'string' || packageJson.version.trim().length === 0) {
    throw new Error(`Missing valid version in ${packageName}`)
  }
  return packageJson.version
}

const [rootPackageJson, cliPackageJson, apiPackageJson] = await Promise.all([
  readJson(rootPackagePath),
  readJson(cliPackagePath),
  readJson(apiPackagePath)
])

const cliVersion = assertVersion(cliPackageJson, '@eslint-config-snapshot/cli')
const apiVersion = assertVersion(apiPackageJson, '@eslint-config-snapshot/api')

if (cliVersion !== apiVersion) {
  throw new Error(`Package versions diverged: cli=${cliVersion} api=${apiVersion}`)
}

if (rootPackageJson.version !== cliVersion) {
  rootPackageJson.version = cliVersion
  await writeFile(rootPackagePath, `${JSON.stringify(rootPackageJson, undefined, 2)}\n`, 'utf8')
}
