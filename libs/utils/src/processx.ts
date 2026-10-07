import { execFileSync } from 'node:child_process'

// Types -----------------------------------------------------------------------
export type CommandRunner = (command: string, args: string[], cwd: string) => void

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
