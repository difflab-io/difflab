import { Command } from 'commander'
import { canonicalGithubUrl } from 'difflab-db'
import { ProjectSetupError } from './errors.js'
import { initializeRepository } from './projects/repo-store.js'
import { createUserStore } from './store/user-store.js'

// Types -----------------------------------------------------------------------
type ProgramOptions = {
  home?: string
  cwd?: string
}

// API -------------------------------------------------------------------------
export function createProgram(
  write: (message: string) => void = console.log,
  version = '0.1.0',
  options: ProgramOptions = {},
): Command {
  const program = new Command()
    .name('difflab')
    .description('Difflab CLI and local MCP server')
    .version(version)

  program.action(() => program.outputHelp())

  const project = program.command('project').description('Manage local projects')
  project
    .command('add [project-key]')
    .option('--name <name>', 'Project name when creating a project')
    .option(
      '--repo <origin>',
      'GitHub repository origin (repeatable)',
      (value: string, all: string[]) => [...all, value],
      [],
    )
    .action(async (projectKey: string | undefined, flags: { name?: string; repo: string[] }) => {
      const name = flags.name
      const repositories = flags.repo
      if (!projectKey || !name?.trim() || !repositories.length)
        throw new ProjectSetupError(
          'project add requires a project key, --name, and at least one --repo; use project add <key> --name <name> --repo <origin>',
        )
      repositories.forEach(canonicalGithubUrl)
      const created = await createUserStore(options.home).createProject(
        projectKey,
        name,
        repositories,
      )
      write(`Created project ${created.name} (${created.id})`)
    })
  project
    .command('list')
    .description('List projects and associated GitHub repositories')
    .action(async () => {
      const projects = await createUserStore(options.home).listProjects()
      if (!projects.length) {
        write('No projects yet.')
        return
      }
      for (const project of projects) {
        write(`${project.id}\t${project.name}`)
        for (const repo of project.repositories) write(`  ${repo.githubUrl}`)
      }
    })

  program
    .command('init <project>')
    .description('Associate this GitHub repository with an existing local project')
    .action(async (projectId: string) => {
      const cwd = options.cwd ?? process.cwd()
      const context = await initializeRepository(cwd, projectId, options.home)
      write(
        `Initialized ${context.repository.github} in project ${context.project.name} (${context.project.id})`,
      )
    })

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
