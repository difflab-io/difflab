import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getRotatingFileSink } from '@logtape/file'
import {
  configureSync,
  getConfig,
  getLogger as logtapeGetLogger,
  type Logger,
  type LogLevel,
  type LogRecord,
} from '@logtape/logtape'

// Constants -------------------------------------------------------------------
const LOG_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warning', 'error', 'fatal']

// Types -----------------------------------------------------------------------
export type DifflabLogLevel = LogLevel
export type { Logger }

export type LoggingConfig = {
  level?: DifflabLogLevel
  logFile?: string
  format?: 'text' | 'jsonl'
}

// API -------------------------------------------------------------------------
export function getLogger(scope: string | readonly string[]): Logger {
  const parts = typeof scope === 'string' ? [scope] : scope
  return logtapeGetLogger(['difflab', ...parts])
}

export function resolveLogLevel(
  env: NodeJS.ProcessEnv = process.env,
  fallback: DifflabLogLevel = 'warning',
): DifflabLogLevel {
  const raw = (env.DIFFLAB_LOG ?? '').trim().toLowerCase()
  return (LOG_LEVELS as readonly string[]).includes(raw) ? (raw as DifflabLogLevel) : fallback
}

export function configureLogging(options: LoggingConfig = {}): void {
  if (getConfig() != null) return

  const level = options.level ?? resolveLogLevel(process.env)
  const format = options.format ?? 'text'
  const render = format === 'jsonl' ? formatJsonRecord : formatTextRecord
  const sinks: Record<string, (record: LogRecord) => void> = {
    stderr: (record: LogRecord) => {
      process.stderr.write(`${render(record)}\n`)
    },
  }
  const activeSinks = ['stderr']

  if (options.logFile) {
    mkdirSync(dirname(options.logFile), { recursive: true })
    sinks.file = getRotatingFileSink(options.logFile, {
      formatter: (record) => `${render(record)}\n`,
    })
    activeSinks.push('file')
  }

  configureSync({
    sinks,
    loggers: [
      { category: ['difflab'], lowestLevel: level, sinks: activeSinks },
      { category: [], lowestLevel: 'fatal', sinks: [] },
    ],
  })
}

// Helpers ---------------------------------------------------------------------
function formatMessage(record: LogRecord): string {
  return record.message
    .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
    .join('')
}

function formatTextRecord(record: LogRecord): string {
  const category = record.category.join('.')
  return `${record.level.toUpperCase()} [${category}] ${formatMessage(record)}`
}

function formatJsonRecord(record: LogRecord): string {
  const message = formatMessage(record)
  return JSON.stringify({
    timestamp: new Date(record.timestamp).toISOString(),
    level: record.level,
    category: record.category.join('.'),
    event: message,
    ...record.properties,
  })
}
