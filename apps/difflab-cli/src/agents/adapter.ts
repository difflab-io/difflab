import { resolveHomeDirectory } from 'utils/osx'
import { runCommand, type CommandRunner } from 'utils/processx'

// Constants -------------------------------------------------------------------
export const mcpServer = {
  command: 'npx',
  args: ['-y', '@difflab/difflab-cli', 'mcp', 'serve'],
} as const

// Types -----------------------------------------------------------------------
export type McpConfigSetupResult = { file: string; status: 'added' | 'existing' }
export type SetupContext = {
  home?: string
  platform?: NodeJS.Platform
  run?: CommandRunner
}

export interface AgentAdapter {
  readonly id: string
  setupMcpConfig(context?: SetupContext): Promise<McpConfigSetupResult>
}

// API -------------------------------------------------------------------------
export function setupHome(context: SetupContext): string {
  return resolveHomeDirectory(context.home)
}

export { runCommand }
