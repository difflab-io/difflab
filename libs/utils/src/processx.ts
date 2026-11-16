import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

// Constants -------------------------------------------------------------------
const execFileAsync = promisify(execFile)

// Types -----------------------------------------------------------------------
export type CommandRunner = (command: string, args: string[], cwd: string) => void

export type ExecCommandOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export type ExecCommandResult = {
  stdout: string
  stderr: string
}

export class CommandExecutionError extends Error {
  constructor(command: string, message: string, options?: ErrorOptions) {
    super(`Could not execute ${command}: ${message}`, options)
    this.name = 'CommandExecutionError'
  }
}

// API -------------------------------------------------------------------------
/**
 * Run `command` with `args` from `cwd` and translate execution failures to
 * CommandExecutionError while preserving the native error as `cause`.
 *
 * The translation gives callers one semantic failure type for commands;
 * the cause remains available for exit status, errno, and other native details.
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

/** Run a subprocess asynchronously and return captured stdout and stderr. */
export async function execCommand(
  command: string,
  args: string[],
  options: ExecCommandOptions = {},
): Promise<ExecCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    return { stdout, stderr }
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim() || (error instanceof Error ? error.message : String(error))
        : error instanceof Error
          ? error.message
          : String(error)
    throw new CommandExecutionError(command, detail, { cause: error })
  }
}
