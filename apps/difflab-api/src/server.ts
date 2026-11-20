import { DifflabConfig, type ApiMode } from 'difflab-config'
import { DifflabDb } from 'difflab-db'
import { configureAppLogger, createAppLogger, resolveLogLevel, type Sink } from 'utils/logx'
import { createApp } from './app.js'
import { AuthService } from './services/auth-service.js'
import { ProjectRpcService } from './services/project-service.js'

// Constants -------------------------------------------------------------------
const serverLogger = createAppLogger('api')

// Types -----------------------------------------------------------------------
/** Optional injected services and log sinks for `startServer`. */
export type ServerDeps = {
  db?: DifflabDb
  authService?: AuthService
  projectService?: ProjectRpcService
  sinks?: Record<string, Sink>
}

// API -------------------------------------------------------------------------
/** Configure logging, compose API services, bind `Bun.serve`, and register graceful shutdown. */
export async function startServer(deps: ServerDeps = {}): Promise<void> {
  configureAppLogger({
    level: resolveLogLevel(process.env, 'info'),
    format: 'jsonl',
    sinks: deps.sinks,
  })
  const config = DifflabConfig.load()
  const mode = deps.authService?.mode ?? config.mode
  const stateDir = mode === 'local' ? config.paths.root : undefined

  const authService =
    deps.authService ??
    AuthService.withOptions({
      mode,
      apiToken: config.apiToken,
    })
  const db = deps.db ?? (await DifflabDb.open({ mode, stateDir }))
  const projectService = deps.projectService ?? new ProjectRpcService(db, authService)

  await serveWithGracefulShutdown({
    db,
    mode,
    authService,
    projectService,
    host: config.host,
    port: config.port,
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
    serverLogger
      .withMetadata({
        mode: options.mode,
        pid: process.pid,
        server_url: serverUrl,
        rpc_url: rpcUrl,
      })
      .info('difflab-api.ready')

    let shuttingDown = false
    const shutdown = async () => {
      if (shuttingDown) return
      shuttingDown = true
      try {
        await server?.stop(true)
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

function formatUrlHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') return '127.0.0.1'
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}
