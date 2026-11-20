// API -------------------------------------------------------------------------
export {
  difflabEnvSchema,
  loadDifflabConfig,
  projectKeySchema,
  readRepoConfig,
  repoConfigPath,
  repoConfigSchema,
  resolveDifflabPaths,
  validateProjectKey,
  writeRepoConfig,
  type ApiMode,
  type DifflabConfig,
  type DifflabConfigLoadOptions,
  type DifflabPaths,
  type RemoteRpcConfig,
  type RepoConfig,
} from './config.js'
export { DifflabConfigError, InvalidRepoConfig, MissingRepoConfig } from './errors.js'
