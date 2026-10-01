import { Command } from 'commander'

export function greeting(name: string): string {
  return `Hello, ${name}!`
}

export function createProgram(
  write: (message: string) => void = console.log,
  version = '0.1.0',
): Command {
  const program = new Command()
    .name('difflab-cli')
    .description('Difflab CLI and local MCP server')
    .version(version)
    .argument('[name]', 'name to greet', 'world')
    .action((name: string) => write(greeting(name)))

  const mcp = program.command('mcp').description('Difflab MCP server commands')

  mcp
    .command('serve')
    .description('Serve Difflab tools over MCP stdio')
    .action(async () => {
      const { serveMcp } = await import('./mcp.js')
      await serveMcp(version)
    })

  mcp
    .command('setup')
    .description('Register the installed Difflab MCP server in selected user-level clients')
    .option(
      '--client <name>',
      'pi, cursor, codex, claude-code, or claude-desktop (repeatable)',
      (name: string, selected: string[]) => [...selected, name],
      [],
    )
    .action(async ({ client }: { client: string[] }) => {
      const { agentNames, agentAdapter } = await import('./agents/index.js')
      if (client.length === 0) {
        throw new Error(`Select at least one client with --client (${agentNames.join(', ')})`)
      }
      const adapters = [...new Set(client)].map((name) => {
        const adapter = agentAdapter(name)
        if (!adapter)
          throw new Error(`Unknown MCP client: ${name}. Choose ${agentNames.join(', ')}`)
        return adapter
      })
      for (const adapter of adapters) {
        const { file, status } = await adapter.setupMcpConfig()
        write(`${status === 'added' ? 'Added' : 'Already configured'} ${adapter.id}: ${file}`)
      }
      write('Restart or reload the selected client to use the Difflab MCP tools.')
    })

  return program
}
