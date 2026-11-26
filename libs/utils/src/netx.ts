import { createServer } from 'node:net'

// Constants -------------------------------------------------------------------
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_POLL_INTERVAL_MS = 150

// Types -----------------------------------------------------------------------
/** Options for polling an HTTP endpoint until it returns a 2xx response. */
export type WaitForHttpOptions = {
  readonly timeoutMs: number
  readonly intervalMs?: number
  readonly checkAborted?: () => string | null
}

// API -------------------------------------------------------------------------
/** Reserve and return an available ephemeral TCP port on `host` (default `127.0.0.1`). */
export function findFreePort(host = DEFAULT_HOST): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

/** Poll `url` until it returns an OK HTTP response, throwing on timeout or abort. */
export async function waitForHttpOk(url: string, options: WaitForHttpOptions): Promise<void> {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const deadline = Date.now() + options.timeoutMs
  while (Date.now() < deadline) {
    const abortReason = options.checkAborted?.()
    if (abortReason) {
      throw new Error(abortReason)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Retry until ready or deadline expires.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timed out waiting for HTTP endpoint at ${url}`)
}
