import { Code, ConnectError } from '@connectrpc/connect'

// Types -----------------------------------------------------------------------
/** Base exception for local client-side errors in `difflab-client-ts`. */
export class DifflabClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabClientError'
  }
}

/** Error thrown when a client target URL or mode configuration is invalid before any RPC is sent. */
export class DifflabClientConfigError extends DifflabClientError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DifflabClientConfigError'
  }
}

// API -------------------------------------------------------------------------
/** Narrow `error` to a ConnectRPC `ConnectError`, optionally matching a specific `Code`. */
export function isConnectError(error: unknown, code?: Code): error is ConnectError {
  if (!(error instanceof ConnectError)) return false
  return code === undefined || error.code === code
}
