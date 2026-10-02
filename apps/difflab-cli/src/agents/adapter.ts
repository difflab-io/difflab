import { resolveHomeDirectory } from '../extensions/osx.js'
import type { CommandRunner } from '../extensions/processx.js'
import { runCommand } from '../extensions/processx.js'

export const mcpServer = {
  command: 'npx',
  args: ['-y', '@difflab/difflab-cli', 'mcp', 'serve'],
} as const

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

export function setupHome(context: SetupContext): string {
  return resolveHomeDirectory(context.home)
}

export { runCommand }
