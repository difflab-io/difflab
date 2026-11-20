// Types -----------------------------------------------------------------------
/** Base exception for all `difflab-config` validation and configuration errors. */
export class DifflabConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabConfigError'
  }
}

/** Error thrown when a repository is missing its `difflab.yaml` configuration file. */
export class MissingRepoConfig extends DifflabConfigError {
  constructor(message: string) {
    super(message)
    this.name = 'MissingRepoConfig'
  }
}

/** Error thrown when `difflab.yaml` cannot be parsed or fails schema validation. */
export class InvalidRepoConfig extends DifflabConfigError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidRepoConfig'
  }
}
