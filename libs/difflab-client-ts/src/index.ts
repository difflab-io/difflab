// API -------------------------------------------------------------------------
export { Code, ConnectError } from '@connectrpc/connect'
export {
  createDifflabClient,
  type DifflabClient,
  type DifflabClientTarget,
  type DifflabTransportOptions,
} from './client.js'
export { DifflabClientConfigError, DifflabClientError, isConnectError } from './errors.js'
export { ProjectService, type Project, type Repository } from './gen/difflab/v1/project_pb.js'
