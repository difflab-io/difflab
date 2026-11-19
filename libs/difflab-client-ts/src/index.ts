// API -------------------------------------------------------------------------
export { Code, ConnectError } from '@connectrpc/connect'
export { createDifflabClient, resolveDifflabClient } from './client.js'
export { DifflabClientConfigError } from './errors.js'
export { ProjectService, type Project, type Repository } from './gen/difflab/v1/project_pb.js'
export type {
  ClientResolutionOptions,
  DifflabClient,
  DifflabClientTarget,
  DifflabTransportOptions,
} from './types.js'
