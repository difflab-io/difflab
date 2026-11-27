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
  type AuthProviderKind,
  type DifflabConfig,
  type DifflabConfigLoadOptions,
  type DifflabPaths,
  type OidcAuthConfig,
  type RemoteRpcConfig,
  type RepoConfig,
} from './config.js'
export { DifflabConfigError, InvalidRepoConfig, MissingRepoConfig } from './errors.js'
