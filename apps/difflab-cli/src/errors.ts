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

export class CommandExecutionError extends DifflabError {
  constructor(command: string, message: string, options?: ErrorOptions) {
    super(`Could not configure ${command}: ${message}`, options)
    this.name = 'CommandExecutionError'
  }
}
