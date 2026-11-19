import type { Client } from '@connectrpc/connect'
import type { ProjectService } from './gen/difflab/v1/project_pb.js'

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
