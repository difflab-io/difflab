// API -------------------------------------------------------------------------
export {
  DifflabConfigError,
  DifflabConfigError as ConfigurationError,
  InvalidRepoConfig,
  MissingRepoConfig,
} from 'difflab-config'

/** Base exception for `difflab-cli` errors. */
export class DifflabError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabError'
  }
}

/** Error thrown when project setup or RPC project operations fail. */
export class ProjectSetupError extends DifflabError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectSetupError'
  }
}

/** Error thrown when the repository-local `.difflab` store or symlink is invalid. */
export class RepoStoreError extends ProjectSetupError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RepoStoreError'
  }
}

/** Error thrown when global Difflab state or daemon setup is missing. */
export class MissingGlobalConfig extends ProjectSetupError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MissingGlobalConfig'
  }
}
