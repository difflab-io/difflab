import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDifflabDb, migrateDatabase, type DifflabDb } from 'difflab-db'
import { daemonMetadataPath, writeDaemonMetadata } from 'utils/daemonx'
import { lstatOrNull } from 'utils/fsx'
import { createApp } from './app.js'
import type { ApiMode } from './context.js'
import { seedFromLegacyIfPresent } from './legacy-seed.js'

// Types -----------------------------------------------------------------------
type CliFlags = {
  port?: number
  stateDir?: string
  host?: string
}

// API -------------------------------------------------------------------------
export { createApp } from './app.js'
export { kActor, type ApiMode } from './context.js'

export async function startServer(argv: string[] = process.argv.slice(2)): Promise<void> {
  const flags = parseFlags(argv)
  const mode = resolveMode(process.env)
  const port = flags.port ?? parsePortEnv(process.env.PORT) ?? (mode === 'local' ? 0 : 8787)
  const host = flags.host ?? process.env.HOST?.trim() ?? '127.0.0.1'

  if (mode === 'cloud') {
    const apiToken = process.env.DIFFLAB_API_TOKEN?.trim()
    if (!apiToken) {
      throw new Error('DIFFLAB_API_TOKEN must be set when starting difflab-api in cloud mode')
    }
    const connectionString = process.env.DATABASE_URL?.trim()
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set when starting difflab-api in cloud mode')
    }
    const db = await createDifflabDb({ dialect: 'postgres', connectionString })
    await serveWithGracefulShutdown({
      db,
      mode: 'cloud',
      apiToken,
      host,
      port,
    })
    return
  }

  const stateDir = flags.stateDir
    ? resolve(flags.stateDir)
    : process.env.DIFFLAB_HOME?.trim()
      ? resolve(process.env.DIFFLAB_HOME.trim())
      : join(homedir(), '.difflab')
  const db = await openLocalDatabase(stateDir)
  await serveWithGracefulShutdown({
    db,
    mode: 'local',
    host,
    port,
    stateDir,
  })
}

// Helpers ---------------------------------------------------------------------
async function openLocalDatabase(stateDir: string): Promise<DifflabDb> {
  const localSqlitePath = join(stateDir, 'local.sqlite')
  const existing = await lstatOrNull(localSqlitePath)
  if (!existing) {
    const applied = await migrateDatabase({ dialect: 'sqlite', path: localSqlitePath })
    const db = await createDifflabDb({ dialect: 'sqlite', path: localSqlitePath })
    try {
      const seeded = await seedFromLegacyIfPresent(db, join(stateDir, 'difflab.sqlite'))
      console.log(
        JSON.stringify({
          event: 'difflab-api.local-db.initialized',
          path: localSqlitePath,
          applied,
          seeded_projects: seeded,
        }),
      )
      return db
    } catch (error) {
      await db.close()
      throw error
    }
  }

  return await createDifflabDb({ dialect: 'sqlite', path: localSqlitePath })
}

async function serveWithGracefulShutdown(options: {
  db: DifflabDb
  mode: ApiMode
  apiToken?: string
  host: string
  port: number
  stateDir?: string
}): Promise<void> {
  let server: ReturnType<typeof Bun.serve> | undefined
  try {
    const app = createApp({
      db: options.db,
      mode: options.mode,
      apiToken: options.apiToken,
    })
    server = Bun.serve({
      hostname: options.host,
      port: options.port,
      fetch: app.fetch,
    })
    const serverUrl = `http://${formatUrlHost(options.host)}:${server.port}`
    const rpcUrl = `${serverUrl}/rpc`
    if (options.mode === 'local' && options.stateDir) {
      await writeDaemonMetadata(options.stateDir, {
        pid: process.pid,
        server_url: serverUrl,
        rpc_url: rpcUrl,
        started_at: new Date().toISOString(),
      })
    }
    console.log(
      JSON.stringify({
        event: 'difflab-api.ready',
        mode: options.mode,
        pid: process.pid,
        server_url: serverUrl,
        rpc_url: rpcUrl,
      }),
    )

    let shuttingDown = false
    const shutdown = async () => {
      if (shuttingDown) return
      shuttingDown = true
      try {
        await server?.stop(true)
        if (options.mode === 'local' && options.stateDir) {
          await rm(daemonMetadataPath(options.stateDir), { force: true })
        }
        await options.db.close()
      } finally {
        process.exit(0)
      }
    }

    process.once('SIGINT', () => void shutdown())
    process.once('SIGTERM', () => void shutdown())
  } catch (error) {
    await server?.stop(true)
    await options.db.close()
    throw error
  }
}

function resolveMode(env: NodeJS.ProcessEnv): ApiMode {
  const explicit = env.DIFFLAB_MODE?.trim().toLowerCase()
  if (explicit === 'cloud') return 'cloud'
  if (explicit === 'local') return 'local'
  return env.DATABASE_URL?.trim() ? 'cloud' : 'local'
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--port' && argv[index + 1]) {
      flags.port = parsePortValue(argv[index + 1]!)
      index += 1
    } else if (arg?.startsWith('--port=')) {
      flags.port = parsePortValue(arg.slice('--port='.length))
    } else if (arg === '--state-dir' && argv[index + 1]) {
      flags.stateDir = argv[index + 1]!
      index += 1
    } else if (arg?.startsWith('--state-dir=')) {
      flags.stateDir = arg.slice('--state-dir='.length)
    } else if (arg === '--host' && argv[index + 1]) {
      flags.host = argv[index + 1]!
      index += 1
    } else if (arg?.startsWith('--host=')) {
      flags.host = arg.slice('--host='.length)
    }
  }
  return flags
}

function parsePortEnv(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  return parsePortValue(value.trim())
}

function parsePortValue(raw: string): number {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port value: ${raw}`)
  }
  return parsed
}

function formatUrlHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') return '127.0.0.1'
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}

if (import.meta.main) {
  startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      JSON.stringify({
        event: 'difflab-api.startup-error',
        pid: process.pid,
        message,
      }),
    )
    process.exit(1)
  })
}
