import { agentNames, agentAdapter } from '../agents/index.js'

export async function setupMcpClients(
  clients: string[],
  write: (message: string) => void,
): Promise<void> {
  if (clients.length === 0) {
    throw new Error(`Select at least one client with --client (${agentNames.join(', ')})`)
  }
  const adapters = [...new Set(clients)].map((name) => {
    const adapter = agentAdapter(name)
    if (!adapter) throw new Error(`Unknown MCP client: ${name}. Choose ${agentNames.join(', ')}`)
    return adapter
  })
  for (const adapter of adapters) {
    const { file, status } = await adapter.setupMcpConfig()
    write(`${status === 'added' ? 'Added' : 'Already configured'} ${adapter.id}: ${file}`)
  }
  write('Restart or reload the selected client to use the Difflab MCP tools.')
}
