import { execFileSync } from 'node:child_process'
import { CommandExecutionError } from '../errors.js'

export type CommandRunner = (command: string, args: string[], cwd: string) => void

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
