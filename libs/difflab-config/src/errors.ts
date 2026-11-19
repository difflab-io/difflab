// Types -----------------------------------------------------------------------
export class ConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ConfigurationError'
  }
}

export class MissingRepoConfig extends ConfigurationError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MissingRepoConfig'
  }
}

export class InvalidRepoConfig extends ConfigurationError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidRepoConfig'
  }
}
