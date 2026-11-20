// API -------------------------------------------------------------------------
export {
  DifflabConfig,
  difflabEnvSchema,
  portSchema,
  projectKeySchema,
  repoConfigSchema,
  type ApiMode,
  type DifflabConfigLoadOptions,
  type DifflabPaths,
  type RemoteRpcConfig,
  type RepoConfig,
} from './config.js'
export { DifflabConfigError, InvalidRepoConfig, MissingRepoConfig } from './errors.js'
