import { createClient, type Client, type Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { DifflabClientConfigError } from './errors.js'
import { ProjectService } from './gen/difflab/v1/project_pb.js'

// Constants -------------------------------------------------------------------
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

// Types -----------------------------------------------------------------------
/** Connection target for a local loopback or authenticated remote Difflab RPC endpoint. */
export type DifflabClientTarget =
  | { mode: 'local'; rpcUrl: string }
  | { mode: 'remote'; rpcUrl: string; token?: string; workspaceId?: string }

/** Optional HTTP transport overrides for `createDifflabClient`. */
export type DifflabTransportOptions = {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

/** Typed Connect JSON-RPC client exposing Difflab service stubs. */
export type DifflabClient = {
  projects: Client<typeof ProjectService>
}

// API -------------------------------------------------------------------------
/** Create a typed Connect JSON-RPC client bound to `target` without managing server processes. */
export function createDifflabClient(
  target: DifflabClientTarget,
  transportOptions?: DifflabTransportOptions,
): DifflabClient {
  assertValidTarget(target)
  const interceptors: Interceptor[] = []
  if (target.mode === 'remote') {
    const token = target.token?.trim()
    const workspaceId = target.workspaceId?.trim()
    interceptors.push((next) => async (req) => {
      if (token && !req.header.has('authorization')) {
        req.header.set('authorization', `Bearer ${token}`)
      }
      if (workspaceId && !req.header.has('x-difflab-workspace')) {
        req.header.set('x-difflab-workspace', workspaceId)
      }
      return await next(req)
    })
  }

  const transport = createConnectTransport({
    baseUrl: target.rpcUrl,
    useBinaryFormat: false,
    interceptors,
    fetch: transportOptions?.fetch,
    defaultTimeoutMs: transportOptions?.timeoutMs,
  })

  return {
    projects: createClient(ProjectService, transport),
  }
}

// Helpers ---------------------------------------------------------------------
function assertValidTarget(target: DifflabClientTarget): void {
  let parsed: URL
  try {
    parsed = new URL(target.rpcUrl)
  } catch (error) {
    throw new DifflabClientConfigError(`Invalid Difflab RPC URL: ${target.rpcUrl}`, {
      cause: error,
    })
  }
  if (target.mode === 'local' && !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new DifflabClientConfigError(
      `Local Difflab RPC target must point to loopback, got: ${target.rpcUrl}`,
    )
  }
}
