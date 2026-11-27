// Types -----------------------------------------------------------------------
/** Semantic authentication error carrying an HTTP status code. */
export class DifflabWebAuthError extends Error {
  readonly status: number

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabWebAuthError'
    this.status = status
  }
}
