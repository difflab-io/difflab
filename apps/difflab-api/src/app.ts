import { createConnectRouter } from '@connectrpc/connect'
import { createFetchHandler } from '@connectrpc/connect/protocol'
import { createValidateInterceptor } from '@connectrpc/validate'
import type { DifflabDb } from 'difflab-db'
import { Hono } from 'hono'
import { createAuthRequestGate, type ApiMode } from './context.js'
import { ProjectService } from './gen/difflab/v1/project_pb.js'
import { createProjectServiceImpl } from './services/project-service.js'

// Types -----------------------------------------------------------------------
export type AppDeps = {
  db: DifflabDb
  mode: ApiMode
  apiToken?: string
  log?: (entry: Record<string, unknown>) => void
}

// API -------------------------------------------------------------------------
export function createApp(deps: AppDeps): Hono {
  const log = deps.log ?? ((entry) => console.log(JSON.stringify(entry)))
  const router = createConnectRouter({
    connect: true,
    grpc: false,
    grpcWeb: false,
    interceptors: [createValidateInterceptor()],
    requestGate: createAuthRequestGate({
      mode: deps.mode,
      apiToken: deps.apiToken,
    }),
  })
  router.service(ProjectService, createProjectServiceImpl(deps.db))

  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true, mode: deps.mode }))

  for (const handler of router.handlers) {
    const fetchHandler = createFetchHandler(handler)
    app.all(`/rpc${handler.requestPath}`, async (c) => {
      const requestBody = await readSafeBody(c.req.raw)
      const response = await fetchHandler(c.req.raw)
      const responseBody = await readSafeBody(response)
      log({
        event: 'difflab-api.rpc',
        timestamp: new Date().toISOString(),
        method: c.req.method,
        path: c.req.path,
        status: response.status,
        workspace: c.req.header('x-difflab-workspace') ?? (deps.mode === 'local' ? 'local' : null),
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
