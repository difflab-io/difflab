import { join } from 'node:path'
import { mcpServer, runCommand, setupHome, type AgentAdapter } from './adapter.js'
import { ConfigurationError } from '../errors.js'
import { readJsonConfig, serverStatus } from '../mcp/json-config.js'

// API -------------------------------------------------------------------------
export const claudeCodeAdapter: AgentAdapter = {
  id: 'claude-code',
  async setupMcpConfig(context = {}) {
    const home = setupHome(context)
    const file = join(home, '.claude.json')
    const status = serverStatus(await readJsonConfig(file), file)
    if (status === 'matching') return { file, status: 'existing' }
    if (status === 'conflicting') {
      throw new ConfigurationError(
        `MCP server "difflab" already exists in ${file} with a different configuration; not modified`,
      )
    }
    const run = context.run ?? runCommand
    run(
      'claude',
      ['mcp', 'add', '--scope', 'user', 'difflab', '--', mcpServer.command, ...mcpServer.args],
      home,
    )
    return { file, status: 'added' }
  },
}
