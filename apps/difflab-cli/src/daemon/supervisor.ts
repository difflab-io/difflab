import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { readUserConfig } from '../config/user-config.js'
import { DifflabError } from '../errors.js'
import { ensureUserStore, userPaths } from '../store/user-store.js'
import { startRigServer } from './rig-server.js'

// Types -----------------------------------------------------------------------
export type DaemonState = {
  pid: number
  appPid: number
  enginePid: number
  appUrl: string
  engineUrl: string
  daemonRigUrl: string
  herdrSession: string | null
  startedAt: string
}

export type DaemonStatusReport = {
  running: boolean
  reused?: boolean
  state: DaemonState | null
}

// API -------------------------------------------------------------------------
export async function inspectDaemonStatus(home?: string): Promise<DaemonStatusReport> {
  const paths = userPaths(home)
  let saved: DaemonState
  try {
    saved = JSON.parse(await readFile(paths.daemonState, 'utf8')) as DaemonState
  } catch {
    return { running: false, state: null }
  }

  if (!isPidAlive(saved.pid)) {
    return { running: false, state: null }
  }

  const healthy = await checkAllServicesHealthy(saved)
  return {
    running: healthy,
    state: saved,
  }
}

export async function startDaemon(options: {
  home?: string
  port?: number
  foreground?: boolean
}): Promise<DaemonStatusReport> {
  const existing = await inspectDaemonStatus(options.home)
  if (existing.running && existing.state) {
    return { running: true, reused: true, state: existing.state }
  }

  await ensureUserStore(options.home)
  const paths = userPaths(options.home)

  if (options.foreground) {
    return runSupervisorForeground(options.home, options.port)
  }

  const logFile = join(paths.root, 'daemon.log')
  const outFd = openSync(logFile, 'a')
  const cliEntry = process.argv[1]
  if (!cliEntry) {
    closeSync(outFd)
    throw new DifflabError('Cannot determine CLI entrypoint to detach daemon')
  }

  const args = [cliEntry, 'daemon', 'up', '--foreground']
  if (options.port !== undefined) {
    args.push('--port', String(options.port))
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...(options.home ? { DIFFLAB_HOME_ROOT: options.home } : {}),
  }

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: childEnv,
  })
  child.unref()
  closeSync(outFd)

  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    const status = await inspectDaemonStatus(options.home)
    if (status.running && status.state) {
      return { running: true, reused: false, state: status.state }
    }
    if (child.pid && !isPidAlive(child.pid)) {
      const logTail = await readFile(logFile, 'utf8').catch(() => '')
      throw new DifflabError(`difflab daemon exited during startup:\n${logTail.slice(-1200)}`)
    }
    await sleep(150)
  }

  throw new DifflabError('Timed out waiting for difflab daemon services to become healthy')
}

export async function stopDaemon(home?: string): Promise<{ stopped: boolean; pid: number | null }> {
  const paths = userPaths(home)
  let saved: DaemonState | null
  try {
    saved = JSON.parse(await readFile(paths.daemonState, 'utf8')) as DaemonState
  } catch {
    saved = null
  }

  await rm(paths.daemonState, { force: true }).catch(() => undefined)
  if (!saved) {
    return { stopped: false, pid: null }
  }

  for (const pid of [saved.pid, saved.appPid, saved.enginePid]) {
    if (pid > 0 && pid !== process.pid) {
      safeKill(pid, 'SIGTERM')
    }
  }

  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    if (!isPidAlive(saved.pid) && !isPidAlive(saved.appPid) && !isPidAlive(saved.enginePid)) {
      break
    }
    await sleep(100)
  }

  for (const pid of [saved.pid, saved.appPid, saved.enginePid]) {
    if (pid > 0 && pid !== process.pid && isPidAlive(pid)) {
      safeKill(pid, 'SIGKILL')
    }
  }

  return { stopped: true, pid: saved.pid }
}

// Helpers ---------------------------------------------------------------------
async function runSupervisorForeground(
  home: string | undefined,
  overridePort: number | undefined,
): Promise<DaemonStatusReport> {
  const paths = userPaths(home)
  const config = await readUserConfig(home)
  const workspaceRoot = resolveWorkspaceRoot()
  const herdrSession = process.env.DIFFLAB_HERDR_SESSION ?? config.herdrSession ?? null

  const usedPorts = new Set<number>()
  const requestedAppPort = overridePort !== undefined ? overridePort : config.appPort
  const appPort = requestedAppPort === 0 ? allocateFreePort(usedPorts) : requestedAppPort
  usedPorts.add(appPort)
  const enginePort =
    overridePort === 0 || config.enginePort === 0 ? allocateFreePort(usedPorts) : config.enginePort
  usedPorts.add(enginePort)
  const rigPort = overridePort === 0 || config.daemonRigPort === 0 ? 0 : config.daemonRigPort

  const rigServer = startRigServer({
    port: rigPort,
    hostname: '127.0.0.1',
    home,
    herdrSession: herdrSession ?? undefined,
  })

  const daemonRigUrl = `http://127.0.0.1:${rigServer.port}`
  const appUrl = `http://127.0.0.1:${appPort}`
  const engineUrl = `http://127.0.0.1:${enginePort}`

  const sharedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...(home ? { DIFFLAB_HOME_ROOT: home } : {}),
    DIFFLAB_STORE_DIR: paths.root,
    DIFFLAB_APP_URL: appUrl,
    DIFFLAB_DAEMON_RIG_URL: daemonRigUrl,
    DIFFLAB_LINEAR_API_URL: process.env.DIFFLAB_LINEAR_API_URL ?? config.linearApiUrl,
    ...((process.env.DIFFLAB_LINEAR_API_KEY ?? config.linearApiKey)
      ? { DIFFLAB_LINEAR_API_KEY: process.env.DIFFLAB_LINEAR_API_KEY ?? config.linearApiKey }
      : {}),
    DIFFLAB_LINEAR_POLL_INTERVAL_MS: String(
      process.env.DIFFLAB_LINEAR_POLL_INTERVAL_MS ?? config.linearPollIntervalMs,
    ),
    ...(herdrSession ? { DIFFLAB_HERDR_SESSION: herdrSession } : {}),
  }

  await mkdir(paths.root, { recursive: true, mode: 0o700 })
  const viteBin = join(workspaceRoot, 'node_modules/vite/bin/vite.js')
  const appDir = join(workspaceRoot, 'apps/difflab-app')
  const engineEntry = join(workspaceRoot, 'apps/difflab-flow-engine/src/index.ts')

  const appProc = spawn(
    process.execPath,
    ['--bun', viteBin, 'dev', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'],
    {
      cwd: appDir,
      stdio: 'inherit',
      env: sharedEnv,
    },
  )

  const engineProc = spawn(process.execPath, [engineEntry], {
    cwd: join(workspaceRoot, 'apps/difflab-flow-engine'),
    stdio: 'inherit',
    env: {
      ...sharedEnv,
      HOST: '127.0.0.1',
      PORT: String(enginePort),
    },
  })

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    if (appProc.pid) safeKill(appProc.pid, 'SIGTERM')
    if (engineProc.pid) safeKill(engineProc.pid, 'SIGTERM')
    rigServer.stop(true)
    await rm(paths.daemonState, { force: true }).catch(() => undefined)
  }

  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0))
  })
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0))
  })

  const state: DaemonState = {
    pid: process.pid,
    appPid: appProc.pid ?? 0,
    enginePid: engineProc.pid ?? 0,
    appUrl,
    engineUrl,
    daemonRigUrl,
    herdrSession,
    startedAt: new Date().toISOString(),
  }

  const readyDeadline = Date.now() + 20_000
  let ready = false
  while (Date.now() < readyDeadline) {
    if (await checkAllServicesHealthy(state)) {
      ready = true
      break
    }
    await sleep(150)
  }

  if (!ready) {
    await shutdown()
    throw new DifflabError('Failed to start difflab-app and difflab-flow-engine within 20s')
  }

  await writeFile(paths.daemonState, JSON.stringify(state, null, 2), 'utf8')

  // Keep foreground supervisor alive until terminated.
  await new Promise<void>(() => undefined)
  return { running: true, state }
}

function resolveWorkspaceRoot(): string {
  if (process.env.DIFFLAB_WORKSPACE_ROOT) {
    return resolve(process.env.DIFFLAB_WORKSPACE_ROOT)
  }
  let dir = resolve(import.meta.dir)
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(join(dir, 'apps/difflab-app/package.json')) &&
      existsSync(join(dir, 'apps/difflab-flow-engine/package.json'))
    ) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new DifflabError('Could not locate Difflab workspace root for apps/difflab-app')
}

function allocateFreePort(exclude: Set<number> = new Set()): number {
  const held: ReturnType<typeof Bun.serve>[] = []
  try {
    for (let attempt = 0; attempt < 16; attempt++) {
      const probe = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch: () => new Response('ok'),
      })
      held.push(probe)
      const port = probe.port ?? 4317
      if (!exclude.has(port)) {
        return port
      }
    }
    return held.at(-1)?.port ?? 4317
  } finally {
    for (const probe of held) {
      probe.stop(true)
    }
  }
}

async function checkAllServicesHealthy(state: DaemonState): Promise<boolean> {
  if (
    (state.appPid > 0 && !isPidAlive(state.appPid)) ||
    (state.enginePid > 0 && !isPidAlive(state.enginePid))
  ) {
    return false
  }
  const checks = await Promise.all([
    probeHealth(`${state.appUrl}/health`, 'difflab-app'),
    probeHealth(`${state.engineUrl}/health`, 'difflab-flow-engine'),
    probeHealth(`${state.daemonRigUrl}/health`),
  ])
  return checks.every(Boolean)
}

async function probeHealth(url: string, expectedService?: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1_500) })
    if (!res.ok) return false
    if (!expectedService) return true
    const data = (await res.json().catch(() => null)) as { service?: string } | null
    return data?.service === expectedService
  } catch {
    return false
  }
}

function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function safeKill(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal)
  } catch {
    // Already exited.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}
