// Types -----------------------------------------------------------------------
export class DifflabDbError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabDbError'
  }
}

export class ProjectValidationError extends DifflabDbError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectValidationError'
  }
}

export class ProjectNotFoundError extends DifflabDbError {
  constructor(key: string) {
    super(`Project not found: ${key}`)
    this.name = 'ProjectNotFoundError'
  }
}

export class ProjectConflictError extends DifflabDbError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectConflictError'
  }
}
