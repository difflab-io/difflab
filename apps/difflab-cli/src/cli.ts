import { Command } from 'commander'
import { listProjects, type Project } from 'difflab-db'
import { ProjectSetupError } from './errors.js'
import { initializeRepository, preflightInit } from './projects/init.js'

// Types -----------------------------------------------------------------------
type Selection = { projectId?: string; newProject?: string }
type ProgramOptions = {
  home?: string
  cwd?: string
  chooseProject?: (projects: Project[]) => Promise<Selection>
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

  program
    .command('project')
    .description('Manage local projects')
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
    .command('init')
    .description('Associate this GitHub repository with a local project')
    .option('--project <id>', 'Use an existing project ID')
    .option('--new-project <name>', 'Create a named project')
    .action(async (flags: Selection) => {
      if (flags.projectId && flags.newProject)
        throw new ProjectSetupError('--project and --new-project are mutually exclusive')
      const cwd = options.cwd ?? process.cwd()
      const preflight = await preflightInit(cwd, options.home)
      let selection = flags
      if (!selection.projectId && !selection.newProject) {
        if (preflight.configuredProjectId) selection = { projectId: preflight.configuredProjectId }
        else if (options.chooseProject)
          selection = await options.chooseProject(await listProjects(options.home))
        else if (process.stdin.isTTY)
          selection = await promptForProject(await listProjects(options.home), write)
        else
          throw new ProjectSetupError(
            'Non-interactive init requires --project <id> or --new-project <name>',
          )
      }
      const context = await initializeRepository({ cwd, home: options.home, ...selection })
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
async function promptForProject(
  projects: Project[],
  write: (message: string) => void,
): Promise<Selection> {
  const { createInterface } = await import('node:readline/promises')
  projects.forEach((project, index) => write(`${index + 1}. ${project.name} (${project.id})`))
  write(`${projects.length + 1}. Create new project`)
  const input = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const choice = (await input.question('Choose a project number (empty to cancel): ')).trim()
    const number = Number(choice)
    if (!choice || !Number.isSafeInteger(number) || number < 1 || number > projects.length + 1) {
      throw new ProjectSetupError('Initialization cancelled or invalid project choice')
    }
    if (number <= projects.length) {
      const project = projects[number - 1]
      if (!project) throw new ProjectSetupError('Project choice is unavailable')
      return { projectId: project.id }
    }
    const name = (await input.question('New project name: ')).trim()
    if (!name) throw new ProjectSetupError('Initialization cancelled: project name is empty')
    return { newProject: name }
  } finally {
    input.close()
  }
}
