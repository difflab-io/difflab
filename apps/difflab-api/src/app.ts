import { createConnectRouter } from '@connectrpc/connect'
import { createFetchHandler } from '@connectrpc/connect/protocol'
import { createValidateInterceptor } from '@connectrpc/validate'
import type { ApiMode } from 'difflab-config'
import type { DifflabDb } from 'difflab-db'
import { Hono } from 'hono'
import { annotateWideEvent, createAppLogger, runWithWideEvent } from 'utils/logx'
import { ProjectService } from './gen/difflab/v1/project_pb.js'
import { AuthService, createAuthService } from './services/auth-service.js'
import { ProjectRpcService } from './services/project-service.js'

// Constants -------------------------------------------------------------------
const rpcLogger = createAppLogger(['api', 'rpc'])

// Types -----------------------------------------------------------------------
export type AppDeps = {
  db: DifflabDb
  mode?: ApiMode
  apiToken?: string
  authService?: AuthService
  projectService?: ProjectRpcService
}

export type AppEnv = {
  Variables: {
    db: DifflabDb
    authService: AuthService
    projectService: ProjectRpcService
  }
}

// API -------------------------------------------------------------------------
export function createApp(deps: AppDeps): Hono<AppEnv> {
  const authService =
    deps.authService ?? createAuthService({ mode: deps.mode ?? 'local', apiToken: deps.apiToken })
  const projectService = deps.projectService ?? new ProjectRpcService(deps.db, authService)

  const router = createConnectRouter({
    connect: true,
    grpc: false,
    grpcWeb: false,
    interceptors: [createValidateInterceptor()],
    requestGate: authService.requestGate,
  })
  router.service(ProjectService, projectService)

  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('db', deps.db)
    c.set('authService', authService)
    c.set('projectService', projectService)
    await next()
  })

  app.get('/health', (c) => c.json({ ok: true, mode: c.var.authService.mode }))

  for (const handler of router.handlers) {
    const fetchHandler = createFetchHandler(handler)
    app.all(`/rpc${handler.requestPath}`, async (c) => {
      return await runWithWideEvent(
        rpcLogger,
        'difflab-api.rpc',
        {
          method: c.req.method,
          path: c.req.path,
          workspace:
            c.req.header('x-difflab-workspace') ??
            (c.var.authService.mode === 'local' ? 'local' : null),
        },
        async () => {
          const requestBody = await readSafeBody(c.req.raw)
          const response = await c.var.authService.runRequestScope(() => fetchHandler(c.req.raw))
          const responseBody = await readSafeBody(response)
          annotateWideEvent({
            status: response.status,
            request: requestBody,
            response: responseBody,
          })
          return response
        },
      )
    })
  }

  return app
}

// Helpers ---------------------------------------------------------------------
async function readSafeBody(message: Request | Response): Promise<unknown> {
  try {
    const raw = await message.clone().text()
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  } catch {
    return null
  }
}
