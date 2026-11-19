import { createClient, type Client, type Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { resolveDifflabPaths, resolveRemoteTargetFromEnv } from 'difflab-config'
import { DifflabDaemon } from 'difflab-daemon'
import { DifflabClientConfigError } from './errors.js'
import { ProjectService } from './gen/difflab/v1/project_pb.js'

// Constants -------------------------------------------------------------------
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

// Types -----------------------------------------------------------------------
export type DifflabClientTarget =
  | { mode: 'local'; rpcUrl: string }
  | { mode: 'remote'; rpcUrl: string; token?: string; workspaceId?: string }

export type DifflabTransportOptions = {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

export type DifflabClient = {
  projects: Client<typeof ProjectService>
}

export type ClientResolutionOptions = {
  home?: string
  client?: DifflabClient
  apiEntry?: string
}

// API -------------------------------------------------------------------------
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

export async function resolveDifflabClient(
  options: ClientResolutionOptions = {},
): Promise<DifflabClient> {
  if (options.client) return options.client

  const remote = resolveRemoteTargetFromEnv()
  if (remote) {
    return createDifflabClient({
      mode: 'remote',
      rpcUrl: remote.rpcUrl,
      token: remote.token,
      workspaceId: remote.workspaceId,
    })
  }

  const paths = resolveDifflabPaths(options.home)
  const status = await DifflabDaemon.withOptions({
    stateDir: paths.root,
    apiEntry: options.apiEntry,
  }).runBackground()
  return createDifflabClient({
    mode: 'local',
    rpcUrl: status.rpc_url,
  })
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
