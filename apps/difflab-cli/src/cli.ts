import { join } from 'node:path'
import { Command } from 'commander'
import { ConnectError, type DifflabClient } from 'difflab-client-ts'
import {
  readRepoConfig,
  resolveDifflabPaths,
  validateProjectKey,
  writeRepoConfig,
} from 'difflab-config'
import { DifflabDbError } from 'difflab-db'
import { canonicalGitUrl, discoverGitRepository, repositorySlug } from 'utils/gitx'
import { getProjectContext, withProjectBackend } from './context.js'
import { ProjectSetupError, RepoStoreError } from './errors.js'
import { ensureRepoStore, preflightRepoStore } from './projects/repo-store.js'
import type { TemplateService } from './templates/service.js'

// Types -----------------------------------------------------------------------
type ProgramOptions = {
  home?: string
  cwd?: string
  templateService?: TemplateService
  client?: DifflabClient
}

class DifflabCommand extends Command {
  override createCommand(name?: string): Command {
    return new DifflabCommand(name)
  }

  override action(fn: Parameters<Command['action']>[0]): this {
    return super.action(async (...args: unknown[]) => {
      try {
        await fn.apply(this, args)
      } catch (error) {
        if (error instanceof ConnectError) {
          throw new ProjectSetupError(error.rawMessage || error.message, { cause: error })
        }
        if (error instanceof DifflabDbError) {
          throw new ProjectSetupError(error.message, { cause: error })
        }
        throw error
      }
    })
  }
}

// API -------------------------------------------------------------------------
/** Construct the `difflab` Commander program with all CLI and MCP subcommands. */
export function createProgram(
  write: (message: string) => void = console.log,
  version = '0.1.0',
  options: ProgramOptions = {},
): Command {
  const program = new DifflabCommand()
    .name('difflab')
    .description('Difflab CLI and local MCP server')
    .version(version)

  program.action(() => program.outputHelp())

  program
    .command('setup')
    .description('Inspect missing machine prerequisites, templates, and hooks')
    .action(async () => {
      const { runSetupReport } = await import('./setup/index.js')
      await runSetupReport(write, {
        home: options.home,
        templateService: options.templateService,
      })
    })

  program
    .command('ui')
    .description('Launch the local Difflab web UI against local.sqlite')
    .option('--port <port>', 'Port to bind on 127.0.0.1 (defaults to a free port)')
    .option('--no-open', 'Do not open the browser automatically')
    .action(async (flags: { port?: string; open: boolean }) => {
      const { runDifflabUi } = await import('./commands/ui.js')
      await runDifflabUi({
        home: options.home,
        port: flags.port ? Number.parseInt(flags.port, 10) : undefined,
        open: flags.open,
        version,
        write,
      })
    })

  const project = program.command('project').description('Manage projects')
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
      if (!projectKey || !name?.trim() || !repositories.length) {
        throw new ProjectSetupError(
          'project add requires a project key, --name, and at least one --repo; use project add <key> --name <name> --repo <origin>',
        )
      }
      const key = validateProjectKey(projectKey)
      repositories.forEach(canonicalGitUrl)
      const created = await withProjectBackend(
        { home: options.home, client: options.client },
        (backend) =>
          backend.createProject({
            key,
            name: name.trim(),
            repositoryUrls: repositories,
          }),
      )
      write(`Created project ${created.name} (${created.key})`)
    })

  project
    .command('list')
    .description('List projects and associated Git repositories')
    .action(async () => {
      const projects = await withProjectBackend(
        { home: options.home, client: options.client },
        (backend) => backend.listProjects(),
      )
      if (!projects.length) {
        write('No projects yet.')
        return
      }
      for (const item of projects) {
        write(`${item.key}\t${item.name}`)
        for (const repo of item.repositories) write(`  ${repo.remoteUrl}`)
      }
    })

  program
    .command('init <project>')
    .description('Associate this Git repository with an existing project')
    .action(async (projectId: string) => {
      const cwd = options.cwd ?? process.cwd()
      const git = discoverGitRepository(cwd)
      const key = validateProjectKey(projectId)
      const config = await readRepoConfig(git.root)
      if (config && config.project.id !== key) {
        throw new RepoStoreError(
          `Repository already belongs to project ${config.project.id}; requested ${key}`,
        )
      }
      const origin = canonicalGitUrl(git.originUrl)
      const target = join(resolveDifflabPaths(options.home).projects, key, repositorySlug(origin))
      await preflightRepoStore(git.root, target)

      const foundProject = await withProjectBackend(
        { home: options.home, client: options.client },
        async (backend) => {
          const existing = await backend.getProject(key)
          if (!existing) throw new ProjectSetupError(`Project not found: ${key}`)
          await backend.linkRepository({
            projectKey: existing.key,
            remoteUrl: origin,
          })
          return existing
        },
      )

      await ensureRepoStore(git.root, target, git.excludePath)
      if (!config) {
        try {
          await writeRepoConfig({ schemaVersion: 1, project: { id: foundProject.key } }, git.root)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
          const existing = await readRepoConfig(git.root)
          if (!existing || existing.project.id !== foundProject.key) {
            throw new RepoStoreError(`Repository config conflicts at ${git.root}`)
          }
        }
      }
      const context = await getProjectContext(git, key, options.home, options.client)
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
    options.templateService ??
    new (await import('./templates/service.js')).TemplateService({ home: options.home })

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
    .action(async (name: string, path: string, filename: string, flags: { cwd?: string }) => {
      const templatesService = await service()
      const destination = await templatesService.scaffoldFromTemplate(
        name,
        flags.cwd ?? options.cwd ?? process.cwd(),
        path,
        filename,
      )
      write(destination)
    })

  return program
}
