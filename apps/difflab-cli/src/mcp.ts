import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { todoTools } from './todos/tools.js'

export function createDifflabServer(version = '0.1.0'): McpServer {
  const server = new McpServer({ name: 'difflab', version })
  for (const tool of todoTools) {
    server.registerTool(tool.name, tool.config, tool.callback)
  }
  return server
}

export async function serveMcp(version?: string): Promise<void> {
  await createDifflabServer(version).connect(new StdioServerTransport())
}
