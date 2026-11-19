import { join } from 'node:path'
import { Command } from 'commander'
import { ConnectError, resolveDifflabClient, type DifflabClient } from 'difflab-client-ts'
import {
  createRepoConfig,
  parsePortValue,
  readRepoConfig,
  resolveDifflabPaths,
  validateProjectKeyFormat,
} from 'difflab-config'
import {
  buildDifflabDaemonOptions,
  getDaemonStatus,
  runDifflabDaemonForeground,
  startDaemon,
  stopDaemon,
} from 'difflab-daemon'
import { canonicalGitUrl, discoverGitRepository, repositorySlug } from 'utils/gitx'
import { getProjectContext } from './context.js'
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
    .command('up')
    .description('Start the local Difflab background RPC server')
    .option('--port <port>', 'TCP port to bind (0 selects an available port)', '0')
    .option('--foreground', 'Run the RPC server in the foreground')
    .option('--json', 'Format status output as JSON')
    .action(async (flags: { port: string; foreground?: boolean; json?: boolean }) => {
      const port = parsePortValue(flags.port)
      const paths = resolveDifflabPaths(options.home)
      if (flags.foreground) {
        await runDifflabDaemonForeground({ stateDir: paths.root, port })
        return
      }
      const status = await startDaemon(buildDifflabDaemonOptions({ stateDir: paths.root, port }))
      if (flags.json) {
        write(JSON.stringify(status, null, 2))
        return
      }
      write(`Difflab daemon running (pid ${status.pid}) at ${status.server_url}`)
    })

  program
    .command('status')
    .description('Show local Difflab background server status')
    .option('--json', 'Format status output as JSON')
    .action(async (flags: { json?: boolean }) => {
      const paths = resolveDifflabPaths(options.home)
      const status = await getDaemonStatus(paths.root)
      if (flags.json) {
        write(JSON.stringify(status, null, 2))
        return
      }
      if (!status.running) {
        write('Difflab daemon is stopped.')
        return
      }
      write(`Difflab daemon running (pid ${status.pid}) at ${status.server_url}`)
    })

  program
    .command('down')
    .description('Stop the local Difflab background server')
    .action(async () => {
      const paths = resolveDifflabPaths(options.home)
      const result = await stopDaemon(paths.root)
      write(
        result.stopped
          ? `Stopped Difflab daemon (pid ${result.pid}).`
          : 'Difflab daemon is not running.',
      )
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
      const key = validateProjectKeyFormat(projectKey)
      repositories.forEach(canonicalGitUrl)
      const client = await resolveDifflabClient({ home: options.home, client: options.client })
      const response = await withRpcError(() =>
        client.projects.createProject({
          key,
          name: name.trim(),
          repositoryUrls: repositories,
        }),
      )
      const created = response.project!
      write(`Created project ${created.name} (${created.key})`)
    })

  project
    .command('list')
    .description('List projects and associated Git repositories')
    .action(async () => {
      const client = await resolveDifflabClient({ home: options.home, client: options.client })
      const { projects } = await withRpcError(() => client.projects.listProjects({}))
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
      const key = validateProjectKeyFormat(projectId)
      const config = await readRepoConfig(git.root)
      if (config && config.project.id !== key) {
        throw new RepoStoreError(
          `Repository already belongs to project ${config.project.id}; requested ${key}`,
        )
      }
      const origin = canonicalGitUrl(git.originUrl)
      const target = join(resolveDifflabPaths(options.home).projects, key, repositorySlug(origin))
      await preflightRepoStore(git.root, target)

      const client = await resolveDifflabClient({ home: options.home, client: options.client })
      const { project: foundProject } = await withRpcError(() =>
        client.projects.getProject({ key }),
      )
      await withRpcError(() =>
        client.projects.linkRepository({
          projectKey: foundProject!.key,
          remoteUrl: origin,
        }),
      )

      await ensureRepoStore(git.root, target, git.excludePath)
      if (!config) {
        try {
          await createRepoConfig({ schemaVersion: 1, project: { id: foundProject!.key } }, git.root)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
          const existing = await readRepoConfig(git.root)
          if (!existing || existing.project.id !== foundProject!.key) {
            throw new RepoStoreError(`Repository config conflicts at ${git.root}`)
          }
        }
      }
      const context = await getProjectContext(git, key, options.home, client)
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

// Helpers ---------------------------------------------------------------------
async function withRpcError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ConnectError) {
      throw new ProjectSetupError(error.rawMessage || error.message, { cause: error })
    }
    throw error
  }
}
