// API -------------------------------------------------------------------------
export { ConfigurationError, InvalidRepoConfig, MissingRepoConfig } from 'difflab-config'

export class DifflabError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabError'
  }
}

export class ProjectSetupError extends DifflabError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectSetupError'
  }
}

export class RepoStoreError extends ProjectSetupError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RepoStoreError'
  }
}

export class MissingGlobalConfig extends ProjectSetupError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MissingGlobalConfig'
  }
}
