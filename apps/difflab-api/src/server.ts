import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  parsePortEnv,
  parsePortValue,
  resolveApiMode,
  resolveDifflabPaths,
  type ApiMode,
} from 'difflab-config'
import { daemonMetadataPath, writeDaemonMetadata } from 'difflab-daemon'
import { openDifflabDb, type DifflabDb } from 'difflab-db'
import { configureLogging, getLogger, resolveLogLevel, type Sink } from 'utils/logx'
import { createApp } from './app.js'
import { AuthService } from './services/auth-service.js'
import { ProjectRpcService } from './services/project-service.js'

// Constants -------------------------------------------------------------------
const serverLogger = getLogger('api')

// Types -----------------------------------------------------------------------
type CliFlags = {
  port?: number
  stateDir?: string
  host?: string
}

export type ServerDeps = {
  db?: DifflabDb
  authService?: AuthService
  projectService?: ProjectRpcService
  sinks?: Record<string, Sink>
}

// API -------------------------------------------------------------------------
export async function startServer(
  argv: string[] = process.argv.slice(2),
  deps: ServerDeps = {},
): Promise<void> {
  configureLogging({
    level: resolveLogLevel(process.env, 'info'),
    format: 'jsonl',
    sinks: deps.sinks,
  })
  const flags = parseFlags(argv)
  const mode = deps.authService?.mode ?? resolveApiMode(process.env)
  const port = flags.port ?? parsePortEnv(process.env.PORT) ?? (mode === 'local' ? 0 : 8787)
  const host = flags.host ?? process.env.HOST?.trim() ?? '127.0.0.1'
  const stateDir =
    mode === 'local'
      ? flags.stateDir
        ? resolve(flags.stateDir)
        : resolveDifflabPaths().root
      : undefined

  const authService =
    deps.authService ??
    AuthService.withOptions({
      mode,
      apiToken: process.env.DIFFLAB_API_TOKEN,
    })
  const db = deps.db ?? (await openDifflabDb({ mode, stateDir }))
  const projectService = deps.projectService ?? new ProjectRpcService(db, authService)

  await serveWithGracefulShutdown({
    db,
    mode,
    authService,
    projectService,
    host,
    port,
    stateDir,
  })
}

// Helpers ---------------------------------------------------------------------
async function serveWithGracefulShutdown(options: {
  db: DifflabDb
  mode: ApiMode
  authService: AuthService
  projectService: ProjectRpcService
  host: string
  port: number
  stateDir?: string
}): Promise<void> {
  let server: ReturnType<typeof Bun.serve> | undefined
  try {
    const app = createApp({
      db: options.db,
      authService: options.authService,
      projectService: options.projectService,
    })
    server = Bun.serve({
      hostname: options.host,
      port: options.port,
      fetch: app.fetch,
    })
    const serverUrl = `http://${formatUrlHost(options.host)}:${server.port}`
    const rpcUrl = `${serverUrl}/rpc`
    if (options.mode === 'local' && options.stateDir) {
      await writeDaemonMetadata(options.stateDir, {
        pid: process.pid,
        server_url: serverUrl,
        rpc_url: rpcUrl,
        started_at: new Date().toISOString(),
      })
    }
    serverLogger.info('difflab-api.ready', {
      mode: options.mode,
      pid: process.pid,
      server_url: serverUrl,
      rpc_url: rpcUrl,
    })

    let shuttingDown = false
    const shutdown = async () => {
      if (shuttingDown) return
      shuttingDown = true
      try {
        await server?.stop(true)
        if (options.mode === 'local' && options.stateDir) {
          await rm(daemonMetadataPath(options.stateDir), { force: true })
        }
        await options.db.close()
      } finally {
        process.exit(0)
      }
    }

    process.once('SIGINT', () => void shutdown())
    process.once('SIGTERM', () => void shutdown())
  } catch (error) {
    await server?.stop(true)
    await options.db.close()
    throw error
  }
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--port' && argv[index + 1]) {
      flags.port = parsePortValue(argv[index + 1]!)
      index += 1
    } else if (arg?.startsWith('--port=')) {
      flags.port = parsePortValue(arg.slice('--port='.length))
    } else if (arg === '--state-dir' && argv[index + 1]) {
      flags.stateDir = argv[index + 1]!
      index += 1
    } else if (arg?.startsWith('--state-dir=')) {
      flags.stateDir = arg.slice('--state-dir='.length)
    } else if (arg === '--host' && argv[index + 1]) {
      flags.host = argv[index + 1]!
      index += 1
    } else if (arg?.startsWith('--host=')) {
      flags.host = arg.slice('--host='.length)
    }
  }
  return flags
}

function formatUrlHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') return '127.0.0.1'
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}
