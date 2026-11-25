import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { loadDifflabConfig } from 'difflab-config'
import { DifflabDb } from 'difflab-db'

// Types -----------------------------------------------------------------------
/** Options for `runDifflabUi`. */
export type RunUiOptions = {
  readonly home?: string
  readonly port?: number
  readonly open?: boolean
  readonly version: string
  readonly write: (line: string) => void
  readonly env?: NodeJS.ProcessEnv
}

// API -------------------------------------------------------------------------
/** Ensure local SQLite is initialized and launch the version-pinned `@difflab/difflab-web` server. */
export async function runDifflabUi(options: RunUiOptions): Promise<void> {
  const env = options.env ?? process.env
  const config = loadDifflabConfig({ home: options.home, env })
  const db = await DifflabDb.open({ mode: 'local', stateDir: config.paths.root, env })
  await db.close()

  const port = options.port && options.port > 0 ? options.port : await findFreePort()
  const url = `http://127.0.0.1:${port}`
  const explicitEntrypoint = env.DIFFLAB_WEB_ENTRYPOINT?.trim()
  const pkgSpec = `@difflab/difflab-web@${options.version}`

  const cmd = explicitEntrypoint ? 'bun' : 'bunx'
  const args = explicitEntrypoint ? [explicitEntrypoint] : [pkgSpec]

  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...env,
      DIFFLAB_MODE: 'local',
      DIFFLAB_AUTH_PROVIDER: 'local',
      DIFFLAB_HOME: config.paths.root,
      HOST: '127.0.0.1',
      PORT: String(port),
      ORIGIN: url,
    },
  })

  child.stdout?.on('data', (chunk: Buffer) => process.stderr.write(chunk))
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))

  await waitForHealth(`${url}/api/health`, 15000, child)
  options.write(`Difflab UI ready at ${url} (${explicitEntrypoint ?? pkgSpec})`)

  if (options.open !== false) {
    openBrowser(url)
  }

  await new Promise<void>((resolve, reject) => {
    const shutdown = () => {
      child.kill('SIGTERM')
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
    child.once('error', reject)
    child.once('exit', () => {
      process.off('SIGINT', shutdown)
      process.off('SIGTERM', shutdown)
      resolve()
    })
  })
}

// Helpers ---------------------------------------------------------------------
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

async function waitForHealth(
  healthUrl: string,
  timeoutMs: number,
  child: ReturnType<typeof spawn>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`difflab-web exited early with code ${child.exitCode}`)
    }
    try {
      const res = await fetch(healthUrl)
      if (res.ok) return
    } catch {
      // retry until ready
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  child.kill('SIGTERM')
  throw new Error(`Timed out waiting for Difflab UI at ${healthUrl}`)
}

function openBrowser(url: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(opener, args, { stdio: 'ignore', detached: true }).unref()
}
