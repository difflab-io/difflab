// API -------------------------------------------------------------------------
export class DifflabError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabError'
  }
}

export class ConfigurationError extends DifflabError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ConfigurationError'
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

export class MissingRepoConfig extends ProjectSetupError {
  constructor(message: string) {
    super(message)
    this.name = 'MissingRepoConfig'
  }
}
export class InvalidRepoConfig extends ProjectSetupError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidRepoConfig'
  }
}
export class MissingGlobalConfig extends ProjectSetupError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MissingGlobalConfig'
  }
}
