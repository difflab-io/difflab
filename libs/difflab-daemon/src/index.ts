// API -------------------------------------------------------------------------
export {
  buildDifflabDaemonOptions,
  daemonMetadataPath,
  ensureDaemon,
  getDaemonStatus,
  resolveDifflabApiEntry,
  runDifflabDaemonForeground,
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
