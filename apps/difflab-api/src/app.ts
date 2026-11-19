import { createConnectRouter } from '@connectrpc/connect'
import { createFetchHandler } from '@connectrpc/connect/protocol'
import { createValidateInterceptor } from '@connectrpc/validate'
import type { ApiMode } from 'difflab-config'
import type { DifflabDb } from 'difflab-db'
import { Hono } from 'hono'
import { getLogger } from 'utils/logx'
import { ProjectService } from './gen/difflab/v1/project_pb.js'
import { createAuthService, type AuthService } from './services/auth-service.js'
import { createProjectServiceImpl } from './services/project-service.js'

// Constants -------------------------------------------------------------------
const rpcLogger = getLogger(['api', 'rpc'])

// Types -----------------------------------------------------------------------
export type AppDeps = {
  db: DifflabDb
  mode: ApiMode
  apiToken?: string
  authService?: AuthService
}

// API -------------------------------------------------------------------------
export function createApp(deps: AppDeps): Hono {
  const authService =
    deps.authService ?? createAuthService({ mode: deps.mode, apiToken: deps.apiToken })
  const router = createConnectRouter({
    connect: true,
    grpc: false,
    grpcWeb: false,
    interceptors: [createValidateInterceptor()],
    requestGate: authService.requestGate,
  })
  router.service(ProjectService, createProjectServiceImpl({ db: deps.db, authService }))

  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true, mode: authService.mode }))

  for (const handler of router.handlers) {
    const fetchHandler = createFetchHandler(handler)
    app.all(`/rpc${handler.requestPath}`, async (c) => {
      const requestBody = await readSafeBody(c.req.raw)
      const response = await fetchHandler(c.req.raw)
      const responseBody = await readSafeBody(response)
      rpcLogger.info('difflab-api.rpc', {
        method: c.req.method,
        path: c.req.path,
        status: response.status,
        workspace:
          c.req.header('x-difflab-workspace') ?? (authService.mode === 'local' ? 'local' : null),
        request: requestBody,
        response: responseBody,
      })
      return response
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
