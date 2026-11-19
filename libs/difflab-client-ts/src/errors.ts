// Types -----------------------------------------------------------------------
export class DifflabClientConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabClientConfigError'
  }
}
