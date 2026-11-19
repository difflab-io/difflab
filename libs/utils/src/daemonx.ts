import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { openSync, closeSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import lockfile from 'proper-lockfile'
import { lstatOrNull } from './fsx.js'

// Constants -------------------------------------------------------------------
const DAEMON_METADATA_FILE = 'daemon.json'
const DAEMON_LOCK_FILE = 'daemon.lock'
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
const DEFAULT_STOP_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 50

// Types -----------------------------------------------------------------------
export type DaemonRecord = {
  pid: number
  server_url: string
  rpc_url: string
  started_at: string
}

export type DaemonStatus =
  { running: false } | { running: true; pid: number; server_url: string; rpc_url: string }

export type DaemonStartOptions = {
  stateDir: string
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  logPath?: string
  startupTimeoutMs?: number
}

export class DaemonLifecycleError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DaemonLifecycleError'
  }
}

// API -------------------------------------------------------------------------
export function daemonMetadataPath(stateDir: string): string {
  return join(stateDir, DAEMON_METADATA_FILE)
}

export async function writeDaemonMetadata(stateDir: string, record: DaemonRecord): Promise<void> {
  await ensureSafeStateDir(stateDir)
  const target = daemonMetadataPath(stateDir)
  const existing = await lstatOrNull(target)
  if (existing?.isSymbolicLink()) {
    throw new DaemonLifecycleError(`Refusing symlinked daemon metadata file: ${target}`)
  }
  const temp = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temp, target)
  } finally {
    await rm(temp, { force: true })
  }
}

export async function getDaemonStatus(stateDir: string): Promise<DaemonStatus> {
  const dirEntry = await lstatOrNull(stateDir)
  if (!dirEntry) return { running: false }
  if (dirEntry.isSymbolicLink() || !dirEntry.isDirectory()) {
    throw new DaemonLifecycleError(`Refusing non-directory daemon state path: ${stateDir}`)
  }
  const record = await readDaemonRecord(stateDir)
  if (!record) return { running: false }
  if (!isProcessAlive(record.pid) || !(await probeHealth(record.server_url))) {
    if (!isProcessAlive(record.pid)) {
      await rm(daemonMetadataPath(stateDir), { force: true })
    }
    return { running: false }
  }
  return {
    running: true,
    pid: record.pid,
    server_url: record.server_url,
    rpc_url: record.rpc_url,
  }
}

export async function startDaemon(
  options: DaemonStartOptions,
): Promise<Extract<DaemonStatus, { running: true }>> {
  await ensureSafeStateDir(options.stateDir)
  const release = await lockfile.lock(options.stateDir, {
    lockfilePath: join(options.stateDir, DAEMON_LOCK_FILE),
    stale: 15_000,
    retries: { retries: 40, minTimeout: 50, maxTimeout: 250 },
  })
  try {
    const active = await getDaemonStatus(options.stateDir)
    if (active.running) return active

    const stale = await readDaemonRecord(options.stateDir)
    if (stale && isProcessAlive(stale.pid)) {
      await terminateProcess(stale.pid, 2_000)
    }
    await rm(daemonMetadataPath(options.stateDir), { force: true })

    const logFile = options.logPath ?? join(options.stateDir, 'daemon.log')
    await mkdir(dirname(logFile), { recursive: true })
    const logStat = await lstatOrNull(logFile)
    if (logStat?.isSymbolicLink()) {
      throw new DaemonLifecycleError(`Refusing symlinked daemon log file: ${logFile}`)
    }
    const logFd = openSync(logFile, 'a')
    let childExitCode: number | null = null
    let childSignal: NodeJS.Signals | null = null
    let childPid: number | undefined
    try {
      const child = spawn(options.command, options.args, {
        cwd: options.cwd ?? process.cwd(),
        env: options.env ?? process.env,
        detached: true,
        stdio: ['ignore', logFd, logFd],
      })
      childPid = child.pid
      child.on('exit', (code, signal) => {
        childExitCode = code
        childSignal = signal
      })
      child.unref()
    } finally {
      closeSync(logFd)
    }

    if (!childPid) {
      throw new DaemonLifecycleError(`Failed to spawn daemon command: ${options.command}`)
    }

    const deadline = Date.now() + (options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS)
    while (Date.now() < deadline) {
      if (childExitCode !== null || childSignal !== null) {
        const tail = await readLogTail(logFile)
        throw new DaemonLifecycleError(
          `Daemon exited during startup (code=${childExitCode ?? 'null'}, signal=${childSignal ?? 'null'})${tail ? `:\n${tail}` : ''}`,
        )
      }
      const record = await readDaemonRecord(options.stateDir)
      if (record && record.pid === childPid && (await probeHealth(record.server_url))) {
        return {
          running: true,
          pid: record.pid,
          server_url: record.server_url,
          rpc_url: record.rpc_url,
        }
      }
      await sleep(POLL_INTERVAL_MS)
    }

    await terminateProcess(childPid, 1_000)
    const tail = await readLogTail(logFile)
    throw new DaemonLifecycleError(
      `Timed out waiting for daemon health check${tail ? `:\n${tail}` : ''}`,
    )
  } finally {
    await release()
  }
}

export function ensureDaemon(
  options: DaemonStartOptions,
): Promise<Extract<DaemonStatus, { running: true }>> {
  return startDaemon(options)
}

export async function stopDaemon(
  stateDir: string,
  timeoutMs = DEFAULT_STOP_TIMEOUT_MS,
): Promise<{ stopped: boolean; pid?: number }> {
  const dirEntry = await lstatOrNull(stateDir)
  if (!dirEntry) return { stopped: false }
  if (dirEntry.isSymbolicLink() || !dirEntry.isDirectory()) {
    throw new DaemonLifecycleError(`Refusing non-directory daemon state path: ${stateDir}`)
  }
  const release = await lockfile.lock(stateDir, {
    lockfilePath: join(stateDir, DAEMON_LOCK_FILE),
    stale: 15_000,
    retries: { retries: 40, minTimeout: 50, maxTimeout: 250 },
  })
  try {
    const record = await readDaemonRecord(stateDir)
    if (!record) return { stopped: false }
    const alive = isProcessAlive(record.pid)
    if (alive) {
      await terminateProcess(record.pid, timeoutMs)
    }
    await rm(daemonMetadataPath(stateDir), { force: true })
    return alive ? { stopped: true, pid: record.pid } : { stopped: false }
  } finally {
    await release()
  }
}

// Helpers ---------------------------------------------------------------------
async function ensureSafeStateDir(stateDir: string): Promise<void> {
  const existing = await lstatOrNull(stateDir)
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) {
    throw new DaemonLifecycleError(`Refusing non-directory daemon state path: ${stateDir}`)
  }
  if (!existing) {
    await mkdir(stateDir, { recursive: true, mode: 0o700 })
  }
}

async function readDaemonRecord(stateDir: string): Promise<DaemonRecord | null> {
  const file = daemonMetadataPath(stateDir)
  const entry = await lstatOrNull(file)
  if (!entry) return null
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new DaemonLifecycleError(`Refusing unsafe daemon metadata file: ${file}`)
  }
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<DaemonRecord>
    if (
      typeof parsed.pid === 'number' &&
      Number.isInteger(parsed.pid) &&
      parsed.pid > 0 &&
      typeof parsed.server_url === 'string' &&
      typeof parsed.rpc_url === 'string' &&
      typeof parsed.started_at === 'string'
    ) {
      return parsed as DaemonRecord
    }
    return null
  } catch {
    return null
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function probeHealth(serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(800),
    })
    return response.ok
  } catch {
    return false
  }
}

async function terminateProcess(pid: number, timeoutMs: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return
    await sleep(POLL_INTERVAL_MS)
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Process already exited.
  }
}

async function readLogTail(logFile: string, maxLines = 25): Promise<string> {
  try {
    const content = await readFile(logFile, 'utf8')
    return content.trim().split('\n').slice(-maxLines).join('\n')
  } catch {
    return ''
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
