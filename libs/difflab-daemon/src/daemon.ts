import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConfigurationError, resolveDifflabPathsFromRoot } from 'difflab-config'
import lockfile from 'proper-lockfile'
import { lstatOrNull } from 'utils/fsx'
import { getLogger } from 'utils/logx'
import { DaemonLifecycleError } from './errors.js'
import type {
  DaemonRecord,
  DaemonStartOptions,
  DaemonStatus,
  DifflabDaemonOptions,
} from './types.js'

// Constants -------------------------------------------------------------------
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DAEMON_METADATA_FILE = 'daemon.json'
const DAEMON_LOCK_FILE = 'daemon.lock'
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000
const DEFAULT_STOP_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 50
const logger = getLogger('daemon')

// API -------------------------------------------------------------------------
export function daemonMetadataPath(stateDir: string): string {
  return join(stateDir, DAEMON_METADATA_FILE)
}

export function resolveDifflabApiEntry(explicitEntry?: string): string {
  const configured = explicitEntry?.trim() || process.env.DIFFLAB_API_ENTRY?.trim()
  if (configured) return resolve(configured)

  const scriptDir = process.argv[1] ? dirname(resolve(process.argv[1])) : MODULE_DIR
  const candidates = [
    resolve(scriptDir, './api.js'),
    resolve(MODULE_DIR, '../../../apps/difflab-api/src/index.ts'),
    resolve(MODULE_DIR, '../../../apps/difflab-api/dist/index.js'),
    resolve(MODULE_DIR, './api.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new ConfigurationError('Unable to locate difflab-api server entrypoint')
}

export function buildDifflabDaemonOptions(options: DifflabDaemonOptions): DaemonStartOptions {
  const port = options.port ?? 0
  const apiEntry = resolveDifflabApiEntry(options.apiEntry)
  const paths = resolveDifflabPathsFromRoot(options.stateDir)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DIFFLAB_HOME: options.stateDir,
    DIFFLAB_MODE: 'local',
  }
  delete env.DATABASE_URL

  return {
    stateDir: options.stateDir,
    command: process.execPath,
    args: [apiEntry, '--port', String(port), '--state-dir', options.stateDir],
    env,
    logPath: options.logPath ?? paths.daemonLog,
  }
}

export async function runDifflabDaemonForeground(options: DifflabDaemonOptions): Promise<void> {
  const start = buildDifflabDaemonOptions(options)
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(start.command, start.args, {
      env: start.env,
      stdio: 'inherit',
    })
    const forwardSigint = () => child.kill('SIGINT')
    const forwardSigterm = () => child.kill('SIGTERM')
    process.on('SIGINT', forwardSigint)
    process.on('SIGTERM', forwardSigterm)
    child.on('error', (error) => {
      process.off('SIGINT', forwardSigint)
      process.off('SIGTERM', forwardSigterm)
      rejectRun(error)
    })
    child.on('exit', (code) => {
      process.off('SIGINT', forwardSigint)
      process.off('SIGTERM', forwardSigterm)
      if (code && code !== 0) {
        process.exitCode = code
      }
      resolveRun()
    })
  })
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

    const logFile = options.logPath ?? join(options.stateDir, 'api.log')
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
        logger.error('Daemon exited during startup', {
          pid: childPid,
          exitCode: childExitCode,
          signal: childSignal,
          logFile,
        })
        throw new DaemonLifecycleError(
          `Daemon exited during startup (code=${childExitCode ?? 'null'}, signal=${childSignal ?? 'null'}); see ${logFile}`,
        )
      }
      const record = await readDaemonRecord(options.stateDir)
      if (record && record.pid === childPid && (await probeHealth(record.server_url))) {
        logger.info('Daemon started', {
          pid: record.pid,
          server_url: record.server_url,
          rpc_url: record.rpc_url,
        })
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
    throw new DaemonLifecycleError(`Timed out waiting for daemon health check; see ${logFile}`)
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}
