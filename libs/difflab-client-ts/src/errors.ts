import { Code, ConnectError } from '@connectrpc/connect'

// Types -----------------------------------------------------------------------
export class DifflabClientConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabClientConfigError'
  }
}

// API -------------------------------------------------------------------------
export function isConnectError(error: unknown, code?: Code): error is ConnectError {
  if (!(error instanceof ConnectError)) return false
  return code === undefined || error.code === code
}
