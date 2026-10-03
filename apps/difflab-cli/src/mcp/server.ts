import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { todoTools } from '../todos/tools.js'

// API -------------------------------------------------------------------------
export async function serveMcp(version = '0.1.0'): Promise<void> {
  const server = new McpServer({ name: 'difflab', version })
  for (const tool of todoTools) {
    server.registerTool(tool.name, tool.config, tool.callback)
  }
  await server.connect(new StdioServerTransport())
}
