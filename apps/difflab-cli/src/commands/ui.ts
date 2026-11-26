import { spawn } from 'node:child_process'
import { loadDifflabConfig } from 'difflab-config'
import { DifflabDb } from 'difflab-db'
import { findFreePort, waitForHttpOk } from 'utils/netx'
import { openUrlInBrowser, waitForChildProcess } from 'utils/processx'

// Constants -------------------------------------------------------------------
const HEALTH_TIMEOUT_MS = 15_000

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

  try {
    await waitForHttpOk(`${url}/api/health`, {
      timeoutMs: HEALTH_TIMEOUT_MS,
      checkAborted: () =>
        child.exitCode !== null ? `difflab-web exited early with code ${child.exitCode}` : null,
    })
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }

  options.write(`Difflab UI ready at ${url} (${explicitEntrypoint ?? pkgSpec})`)

  if (options.open !== false) {
    openUrlInBrowser(url)
  }

  await waitForChildProcess(child)
}
