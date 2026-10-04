import { Command } from 'commander'
import { canonicalGithubUrl, createProject, listProjects } from 'difflab-db'
import { input } from '@inquirer/prompts'
import { ProjectSetupError } from './errors.js'
import { initializeRepository, preflightInit } from './projects/init.js'

// Types -----------------------------------------------------------------------
type ProgramOptions = {
  home?: string
  cwd?: string
  promptProjectAdd?: () => Promise<{ key?: string; name: string; repositories: string[] }>
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
      let name = flags.name
      let repositories = flags.repo
      let key = projectKey
      if (!key || !name || !repositories.length) {
        const answers = options.promptProjectAdd
          ? await options.promptProjectAdd()
          : await promptForProjectAdd({
              key: key !== undefined,
              name: Boolean(name),
              repositories: repositories.length > 0,
            })
        key ||= answers.key
        name ||= answers.name
        repositories = repositories.length ? repositories : answers.repositories
      }
      if (!repositories.length)
        throw new ProjectSetupError('project add requires at least one --repo')
      if (!key) throw new ProjectSetupError('project add requires a project key')
      repositories.forEach(canonicalGithubUrl)
      const created = await createProject(key, name ?? '', options.home, repositories)
      write(`Created project ${created.name} (${created.id})`)
    })
  project
    .command('list')
    .description('List projects and associated GitHub repositories')
    .action(async () => {
      const projects = await listProjects(options.home)
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
      const preflight = await preflightInit(cwd, options.home)
      if (preflight.configuredProjectId && preflight.configuredProjectId !== projectId)
        throw new ProjectSetupError('Repository already belongs to a different project')
      const context = await initializeRepository({ cwd, home: options.home, projectId })
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

// Helpers ---------------------------------------------------------------------
async function promptForProjectAdd(missing: {
  key: boolean
  name: boolean
  repositories: boolean
}): Promise<{
  key?: string
  name: string
  repositories: string[]
}> {
  const key = missing.key
    ? await input({ message: 'Project key (3-16 uppercase letters/digits):' })
    : undefined
  const name = missing.name ? await input({ message: 'Project name:' }) : ''
  const origins = missing.repositories
    ? await input({ message: 'GitHub repository origins (comma-separated):' })
    : ''
  return {
    key,
    name,
    repositories: origins
      .split(',')
      .map((origin: string) => origin.trim())
      .filter(Boolean),
  }
}
