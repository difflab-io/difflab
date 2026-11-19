// Types -----------------------------------------------------------------------
export class DaemonLifecycleError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DaemonLifecycleError'
  }
}
