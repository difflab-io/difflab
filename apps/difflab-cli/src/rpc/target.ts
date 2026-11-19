import { createDifflabClient, type DifflabClient } from 'difflab-client-ts'
import { ensureDaemon } from 'utils/daemonx'
import { buildDaemonStartOptions, resolveDifflabPaths } from '../daemon/config.js'

// Types -----------------------------------------------------------------------
export type ClientResolutionOptions = {
  home?: string
  client?: DifflabClient
}

// API -------------------------------------------------------------------------
export async function resolveDifflabClient(
  options: ClientResolutionOptions = {},
): Promise<DifflabClient> {
  if (options.client) return options.client

  const remoteRpcUrl = process.env.DIFFLAB_RPC_URL?.trim()
  if (remoteRpcUrl) {
    return createDifflabClient({
      mode: 'remote',
      rpcUrl: remoteRpcUrl,
      token: process.env.DIFFLAB_API_TOKEN,
      workspaceId: process.env.DIFFLAB_WORKSPACE,
    })
  }

  const paths = resolveDifflabPaths(options.home)
  const status = await ensureDaemon(buildDaemonStartOptions({ stateDir: paths.root }))
  return createDifflabClient({
    mode: 'local',
    rpcUrl: status.rpc_url,
  })
}
