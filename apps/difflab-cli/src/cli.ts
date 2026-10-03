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
      const { serveMcp } = await import('./mcp/index.js')
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
      const { setupMcpClients } = await import('./mcp/index.js')
      await setupMcpClients(client, write)
    })

  return program
}
