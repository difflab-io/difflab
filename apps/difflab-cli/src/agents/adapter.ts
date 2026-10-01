import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

export const mcpServer = {
  command: 'npx',
  args: ['-y', '@difflab/difflab-cli', 'mcp', 'serve'],
} as const

export type SetupResult = { file: string; status: 'added' | 'existing' }
export type CommandRunner = (command: string, args: string[], cwd: string) => void
export type SetupContext = {
  home?: string
  platform?: NodeJS.Platform
  run?: CommandRunner
}

export interface AgentAdapter {
  readonly id: string
  setupMcpConfig(context?: SetupContext): Promise<SetupResult>
}

export function setupHome(context: SetupContext): string {
  return context.home ?? homedir()
}

export function runCommand(command: string, args: string[], cwd: string): void {
  try {
    execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    throw new Error(
      `Could not configure ${command}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

export function isFileError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
