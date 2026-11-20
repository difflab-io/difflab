import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { LogTapeTransport } from '@loglayer/transport-logtape'
import { getRotatingFileSink } from '@logtape/file'
import {
  configureSync,
  defaultTextFormatter,
  getConfig,
  getJsonLinesFormatter,
  getLogger as logtapeGetLogger,
  withContext,
  type Logger,
  type LogLevel,
  type LogRecord,
  type Sink,
} from '@logtape/logtape'
import { LogLayer, type ILogLayer } from 'loglayer'

// Constants -------------------------------------------------------------------
const LOG_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warning', 'error', 'fatal']
const logContextStorage = new AsyncLocalStorage<Record<string, unknown>>()
const wideEventStorage = new AsyncLocalStorage<Record<string, unknown>>()

// Types -----------------------------------------------------------------------
/** Supported Difflab log levels backed by LogTape. */
export type DifflabLogLevel = LogLevel
export type { ILogLayer, Logger, LogRecord, Sink }

/** Startup configuration for multi-sink application logging. */
export type LoggingConfig = {
  level?: DifflabLogLevel
  logFile?: string
  format?: 'text' | 'jsonl'
  stderr?: boolean
  sinks?: Record<string, Sink>
}

// API -------------------------------------------------------------------------
/** Acquire a minimal `@logtape/logtape` library logger under `['difflab', ...]` without configuring sinks. */
export function createLibLogger(scope: string | readonly string[]): Logger {
  const parts = typeof scope === 'string' ? [scope] : scope
  return logtapeGetLogger(['difflab', ...parts])
}

/** Create a `LogLayer` application logger backed by `@logtape/logtape` for structured wide events. */
export function createAppLogger(scope: string | readonly string[]): ILogLayer {
  return new LogLayer({
    transport: new LogTapeTransport({ logger: createLibLogger(scope) }),
  })
}

/** Resolve the effective log level threshold from `DIFFLAB_LOG` or `fallback`. */
export function resolveLogLevel(
  env: NodeJS.ProcessEnv = process.env,
  fallback: DifflabLogLevel = 'warning',
): DifflabLogLevel {
  const raw = (env.DIFFLAB_LOG ?? '').trim().toLowerCase()
  if (raw === 'warn') return 'warning'
  return (LOG_LEVELS as readonly string[]).includes(raw) ? (raw as DifflabLogLevel) : fallback
}

/** Configure application sinks (stderr, optional rotating file, and custom sinks) idempotently. */
export function configureAppLogger(options: LoggingConfig = {}): void {
  if (getConfig() != null) return

  const level = options.level ?? resolveLogLevel(process.env)
  const formatter =
    options.format === 'jsonl'
      ? getJsonLinesFormatter({ properties: 'flatten' })
      : defaultTextFormatter
  const sinks: Record<string, Sink> = {}
  const activeSinks: string[] = []

  if (options.stderr !== false) {
    sinks.stderr = (record) => {
      process.stderr.write(formatter(record))
    }
    activeSinks.push('stderr')
  }

  if (options.logFile) {
    mkdirSync(dirname(options.logFile), { recursive: true })
    sinks.file = getRotatingFileSink(options.logFile, { formatter })
    activeSinks.push('file')
  }

  for (const [name, sink] of Object.entries(options.sinks ?? {})) {
    sinks[name] = sink
    activeSinks.push(name)
  }

  configureSync({
    sinks,
    contextLocalStorage: logContextStorage,
    loggers: [
      { category: ['difflab'], lowestLevel: level, sinks: activeSinks },
      { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: activeSinks },
      { category: [], lowestLevel: 'fatal', sinks: [] },
    ],
  })
}

/** Attach structured fields to the active request's wide-event log record. */
export function annotateWideEvent(fields: Record<string, unknown>): void {
  const store = wideEventStorage.getStore()
  if (store) Object.assign(store, fields)
}

/** Run `fn` inside a request scope and emit one canonical LogLayer wide-event record on completion. */
export async function runWithWideEvent<T>(
  logger: ILogLayer,
  eventName: string,
  initialFields: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const requestId =
    typeof initialFields.request_id === 'string' ? initialFields.request_id : randomUUID()
  const startedAt = performance.now()
  const fields: Record<string, unknown> = { request_id: requestId, ...initialFields }

  return await wideEventStorage.run(fields, () =>
    withContext({ request_id: requestId }, async () => {
      try {
        return await fn()
      } catch (error) {
        fields.error = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        fields.duration_ms = Math.round((performance.now() - startedAt) * 100) / 100
        logger.withMetadata(fields).info(eventName)
      }
    }),
  )
}
