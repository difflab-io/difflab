// Types -----------------------------------------------------------------------
/** Base exception for all `difflab-daemon` errors. */
export class DifflabDaemonError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabDaemonError'
  }
}

/** Error thrown when starting, locking, or stopping a local daemon fails. */
export class DaemonLifecycleError extends DifflabDaemonError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DaemonLifecycleError'
  }
}
