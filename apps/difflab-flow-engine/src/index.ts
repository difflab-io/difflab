import app from './app.js'
import { pollLinearReadyIssues } from './linear-poller.js'

// Constants -------------------------------------------------------------------
const port = Number(process.env.PORT ?? 4318)
const hostname = process.env.HOST ?? '127.0.0.1'
const pollIntervalMs = Number(process.env.DIFFLAB_LINEAR_POLL_INTERVAL_MS ?? 0)

// API -------------------------------------------------------------------------
if (import.meta.main && pollIntervalMs > 0) {
  const timer = setInterval(() => {
    void pollLinearReadyIssues().catch(() => undefined)
  }, pollIntervalMs)
  timer.unref()
}

export default {
  port,
  hostname,
  fetch: app.fetch,
}
