import { createInterface } from 'node:readline'

type Colorizer = {
  green: (text: string) => string
  yellow: (text: string) => string
  cyan: (text: string) => string
  red: (text: string) => string
  bold: (text: string) => string
  dim: (text: string) => string
}

export type RunTimer = {
  label: string
  startedAtMs: number
  pausedMs: number
  pauseStartedAtMs: number | undefined
}

export class TerminalIO {
  private readonly color = createColorizer()
  private activeRunTimer: RunTimer | undefined

  get isTTY(): boolean {
    return process.stdout.isTTY === true
  }

  get isInteractive(): boolean {
    return process.stdin.isTTY === true && process.stdout.isTTY === true
  }

  get showProgress(): boolean {
    if (process.env.ESLINT_CONFIG_SNAPSHOT_NO_PROGRESS === '1') {
      return false
    }
    return this.isTTY
  }

  get colors(): Colorizer {
    return this.color
  }

  write(text: string): void {
    process.stdout.write(text)
  }

  error(text: string): void {
    process.stderr.write(text)
  }

  subtle(text: string): void {
    this.write(this.color.dim(text))
  }

  section(title: string): void {
    this.write(`${this.color.bold(title)}\n`)
  }

  success(text: string): void {
    this.write(this.color.green(text))
  }

  warning(text: string): void {
    this.write(this.color.yellow(text))
  }

  danger(text: string): void {
    this.write(this.color.red(text))
  }

  bold(text: string): string {
    return this.color.bold(text)
  }

  beginRun(label: string): void {
    if (!this.showProgress) {
      this.activeRunTimer = undefined
      return
    }

    this.activeRunTimer = {
      label,
      startedAtMs: Date.now(),
      pausedMs: 0,
      pauseStartedAtMs: undefined
    }
  }

  endRun(exitCode: number, logTiming: (timer: RunTimer, elapsedMs: number) => void): void {
    if (!this.activeRunTimer || !this.showProgress) {
      return
    }

    if (this.activeRunTimer.pauseStartedAtMs !== undefined) {
      this.activeRunTimer.pausedMs += Date.now() - this.activeRunTimer.pauseStartedAtMs
      this.activeRunTimer.pauseStartedAtMs = undefined
    }

    const elapsedMs = Math.max(0, Date.now() - this.activeRunTimer.startedAtMs - this.activeRunTimer.pausedMs)
    logTiming(this.activeRunTimer, elapsedMs)
    const seconds = (elapsedMs / 1000).toFixed(2)
    this.subtle(exitCode === 0 ? `⏱️ Finished in ${seconds}s\n` : `⏱️ Finished with errors in ${seconds}s\n`)
    this.activeRunTimer = undefined
  }

  pauseRun(): void {
    if (!this.activeRunTimer || this.activeRunTimer.pauseStartedAtMs !== undefined) {
      return
    }
    this.activeRunTimer.pauseStartedAtMs = Date.now()
  }

  resumeRun(): void {
    if (!this.activeRunTimer || this.activeRunTimer.pauseStartedAtMs === undefined) {
      return
    }
    this.activeRunTimer.pausedMs += Date.now() - this.activeRunTimer.pauseStartedAtMs
    this.activeRunTimer.pauseStartedAtMs = undefined
  }

  async withPausedRunTimer<T>(task: () => Promise<T>): Promise<T> {
    this.pauseRun()
    try {
      return await task()
    } finally {
      this.resumeRun()
    }
  }

  async askYesNo(prompt: string, defaultYes: boolean): Promise<boolean> {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const answerRaw = await this.askQuestion(rl, prompt)
      const answer = answerRaw.trim().toLowerCase()
      if (answer.length === 0) {
        return defaultYes
      }

      return answer === 'y' || answer === 'yes'
    } finally {
      rl.close()
    }
  }

  private async askQuestion(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
    this.pauseRun()
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        this.resumeRun()
        resolve(answer)
      })
    })
  }
}

export function resolveInvocationLabel(argv: string[]): string {
  const commandToken = argv.find((entry) => !entry.startsWith('-'))
  if (commandToken) {
    return commandToken
  }
  if (argv.includes('-u') || argv.includes('--update')) {
    return 'update'
  }
  if (argv.includes('-h') || argv.includes('--help')) {
    return 'help'
  }
  return 'check'
}

function createColorizer(): Colorizer {
  const enabled = process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'
  const wrap = (code: string, text: string) => (enabled ? `\u001B[${code}m${text}\u001B[0m` : text)
  return {
    green: (text: string) => wrap('32', text),
    yellow: (text: string) => wrap('33', text),
    cyan: (text: string) => wrap('36', text),
    red: (text: string) => wrap('31', text),
    bold: (text: string) => wrap('1', text),
    dim: (text: string) => wrap('2', text)
  }
}
