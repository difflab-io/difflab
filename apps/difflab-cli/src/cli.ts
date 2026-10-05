import { Command } from 'commander'
import { validateProjectKey } from 'difflab-db'
import { canonicalGitUrl, discoverGitRepository, repositorySlug } from 'difflab-ts/gitx'
import { join } from 'node:path'
import { ProjectSetupError, RepoStoreError } from './errors.js'
import { createRepoConfig, readRepoConfig } from './projects/config.js'
import { getProjectContext } from './context.js'
import { ensureRepoStore, preflightRepoStore } from './projects/repo-store.js'
import { createUserStore, userPaths, withUserStore } from './store/user-store.js'

// Types -----------------------------------------------------------------------
type ProgramOptions = {
  home?: string
  cwd?: string
  templateService?: TemplateService
}
import type { TemplateService } from './templates/service.js'

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
      'Git repository origin (repeatable)',
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
      repositories.forEach(canonicalGitUrl)
      const created = await createUserStore(options.home).createProject(
        projectKey,
        name,
        repositories,
      )
      write(`Created project ${created.name} (${created.id})`)
    })
  project
    .command('list')
    .description('List projects and associated Git repositories')
    .action(async () => {
      const projects = await createUserStore(options.home).listProjects()
      if (!projects.length) {
        write('No projects yet.')
        return
      }
      for (const project of projects) {
        write(`${project.id}\t${project.name}`)
        for (const repo of project.repositories) write(`  ${repo.url}`)
      }
    })

  program
    .command('init <project>')
    .description('Associate this Git repository with an existing local project')
    .action(async (projectId: string) => {
      const cwd = options.cwd ?? process.cwd()
      const git = discoverGitRepository(cwd)
      const key = validateProjectKey(projectId)
      const config = await readRepoConfig(git.root)
      if (config && config.project.id !== key)
        throw new RepoStoreError(
          `Repository already belongs to project ${config.project.id}; requested ${key}`,
        )
      const origin = canonicalGitUrl(git.originUrl)
      const target = join(userPaths(options.home).projects, key, repositorySlug(origin))
      await preflightRepoStore(git.root, target)
      const project = await withUserStore(
        async (db) => {
          const project = await db.projects.getProjectById(key)
          await db.repositories.linkRepositoryToProject(project.id, origin)
          return project
        },
        { home: options.home },
      )
      await ensureRepoStore(git.root, target, git.excludePath)
      if (!config) {
        try {
          await createRepoConfig({ schemaVersion: 1, project: { id: project.id } }, git.root)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
          const existing = await readRepoConfig(git.root)
          if (!existing || existing.project.id !== project.id)
            throw new RepoStoreError(`Repository config conflicts at ${git.root}`)
        }
      }
      const context = await getProjectContext(git, key, options.home)
      write(
        `Initialized ${context.repository.origin} in project ${context.project.name} (${context.project.id})`,
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

  const templates = program.command('templates').description('List and scaffold documents')
  const service = async () =>
    options.templateService ?? new (await import('./templates/service.js')).TemplateService()

  templates
    .command('list')
    .description('List available document templates')
    .action(async () => {
      const templatesService = await service()
      for (const template of await templatesService.listTemplates()) {
        write(`${template.name} — ${template.description}`)
      }
    })

  templates
    .command('scaffold <name> <path> <filename>')
    .description('Copy a template into a new document inside a directory; never overwrite')
    .option('--cwd <directory>', 'absolute base directory for the relative destination path')
    .action(async (name: string, path: string, filename: string, options: { cwd?: string }) => {
      const templatesService = await service()
      const destination = await templatesService.scaffoldFromTemplate(
        name,
        options.cwd ?? process.cwd(),
        path,
        filename,
      )
      write(destination)
    })

  return program
}
