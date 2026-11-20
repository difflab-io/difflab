import { execFileSync, spawnSync } from 'node:child_process'

// Constants -------------------------------------------------------------------
const TERMINATE_POLL_MS = 50

// Types -----------------------------------------------------------------------
/** Function signature for executing a command synchronously in a working directory. */
export type CommandRunner = (command: string, args: string[], cwd: string) => void

/** Error thrown when a subprocess command cannot be executed. */
export class CommandExecutionError extends Error {
  constructor(command: string, message: string, options?: ErrorOptions) {
    super(`Could not execute ${command}: ${message}`, options)
    this.name = 'CommandExecutionError'
  }
}

// API -------------------------------------------------------------------------
/** Probe `command --version` and return its first non-empty output line, or null on failure. */
export function probeCommandVersion(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const result = spawnSync(command, ['--version'], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
  })
  if (result.error || result.status !== 0) return null
  const text = (result.stdout || result.stderr || '').trim()
  return text.split(/\r?\n/)[0] || command
}

/** Return true if a process with `pid` currently exists. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

/** Send SIGTERM to `pid`, wait up to `timeoutMs` for exit, and escalate to SIGKILL if needed. */
export async function terminateProcess(pid: number, timeoutMs = 5_000): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return
    await Bun.sleep(TERMINATE_POLL_MS)
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Process already exited.
  }
}

/**
 * Run `command` with `args` from `cwd` and translate execution failures to
 * CommandExecutionError while preserving the native error as `cause`.
 */
export function runCommand(command: string, args: string[], cwd: string): void {
  try {
    execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    throw new CommandExecutionError(
      command,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    )
  }
}
