// API -------------------------------------------------------------------------
export {
  daemonMetadataPath,
  DifflabDaemon,
  ensureDaemon,
  getDaemonStatus,
  resolveDifflabApiEntry,
  startDaemon,
  stopDaemon,
  writeDaemonMetadata,
} from './daemon.js'
export { DaemonLifecycleError } from './errors.js'
export type {
  DaemonRecord,
  DaemonStartOptions,
  DaemonStatus,
  DifflabDaemonOptions,
} from './types.js'
