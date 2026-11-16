import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Command } from 'commander'
import type { FlowRun, FlowRunDetail } from 'difflab-db'
import { inspectDaemonStatus } from '../daemon/supervisor.js'
import { DifflabError } from '../errors.js'

// Constants -------------------------------------------------------------------
const TERMINAL_RUN_STATUSES = new Set(['done', 'failed', 'blocked'])

// API -------------------------------------------------------------------------
export function registerFlowCommands(
  program: Command,
  write: (message: string) => void,
  options: { home?: string; cwd?: string } = {},
): void {
  const flows = program
    .command('flows')
    .description('Run and inspect orchestrated Difflab workflow runs')

  flows
    .command('run <flow-name>')
    .description('Start an orchestrated workflow run through difflab-app')
    .option('--cwd <dir>', 'Target repository directory')
    .option(
      '--input <pair>',
      'Flow input binding key=value (repeatable)',
      (val: string, all: string[]) => [...all, val],
      [],
    )
    .option(
      '--flag <flag>',
      'Flow flag such as --local or --merge (repeatable)',
      (val: string, all: string[]) => [...all, val],
      [],
    )
    .option('--harness <kind>', 'Override harness kind (claude, codex, pi, mock)')
    .option('--json', 'Emit JSON response')
    .action(
      async (
        flowName: string,
        flags: {
          cwd?: string
          input: string[]
          flag: string[]
          harness?: string
          json?: boolean
        },
      ) => {
        const appUrl = await resolveAppUrl(options.home)
        const inputs: Record<string, string> = {}
        for (const entry of flags.input) {
          const eq = entry.indexOf('=')
          if (eq <= 0) {
            throw new DifflabError(`Invalid --input '${entry}'; expected key=value`)
          }
          inputs[entry.slice(0, eq).trim()] = entry.slice(eq + 1)
        }

        const normalizedFlags = flags.flag.map((f) => (f.startsWith('--') ? f : `--${f}`))
        const response = await fetch(`${appUrl}/v1/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flowName,
            cwd: flags.cwd ?? options.cwd ?? process.cwd(),
            inputs,
            flags: normalizedFlags,
            ...(flags.harness ? { harness: flags.harness } : {}),
          }),
        })

        const body = (await response.json()) as FlowRunDetail & { error?: string }
        if (!response.ok) {
          throw new DifflabError(body.error ?? `Failed to start flow (${response.status})`)
        }

        if (flags.json) {
          write(JSON.stringify(body))
          return
        }

        write(
          `Started ${body.run.flowName} (${body.run.id}) — status: ${body.run.status}, steps: ${body.steps.length}`,
        )
      },
    )

  flows
    .command('list')
    .description('List workflow runs')
    .option('--repo <cwd>', 'Filter runs by repository directory')
    .option('--status <status>', 'Filter runs by status (queued, running, blocked, done, failed)')
    .option('--json', 'Emit JSON response')
    .action(async (flags: { repo?: string; status?: string; json?: boolean }) => {
      const appUrl = await resolveAppUrl(options.home)
      const params = new URLSearchParams()
      if (flags.repo) params.set('cwd', flags.repo)
      if (flags.status) params.set('status', flags.status)

      const qs = params.toString()
      const response = await fetch(`${appUrl}/v1/runs${qs ? `?${qs}` : ''}`)
      const body = (await response.json()) as { runs?: FlowRun[]; error?: string }
      if (!response.ok) {
        throw new DifflabError(body.error ?? `Failed to list runs (${response.status})`)
      }

      const runs = body.runs ?? []
      if (flags.json) {
        write(JSON.stringify({ runs }))
        return
      }

      if (!runs.length) {
        write('No workflow runs found.')
        return
      }

      for (const run of runs) {
        write(
          `${run.id}\t${run.flowName}\t${run.status}\tharness=${run.harness}${run.herdrPaneId ? `\tpane=${run.herdrPaneId}` : ''}`,
        )
      }
    })

  flows
    .command('status <run-id>')
    .description('Inspect status, steps, and Herdr metadata for a workflow run')
    .option('--json', 'Emit JSON response')
    .action(async (runId: string, flags: { json?: boolean }) => {
      const appUrl = await resolveAppUrl(options.home)
      const detail = await fetchRunDetail(appUrl, runId)

      if (flags.json) {
        write(JSON.stringify(detail))
        return
      }

      write(`Run: ${detail.run.id} (${detail.run.flowName}) — ${detail.run.status}`)
      if (detail.run.herdrPaneId) {
        write(
          `Herdr: session=${detail.run.herdrSession ?? 'default'} pane=${detail.run.herdrPaneId} agent=${detail.run.herdrAgentName ?? 'n/a'}`,
        )
      }
      if (detail.run.worktreePath) {
        write(`Worktree: ${detail.run.worktreePath}`)
      }
      for (const step of detail.steps) {
        write(
          `  [${step.status}] ${step.seq}. ${step.stepId}${step.handoff ? ` -> ${step.handoff}` : ''}`,
        )
      }
    })

  flows
    .command('logs <run-id>')
    .description('Read or stream progress logs for a workflow run')
    .option('--lines <count>', 'Maximum historical lines to display', '100')
    .option('--follow', 'Stream live updates until the workflow run finishes')
    .action(async (runId: string, flags: { lines?: string; follow?: boolean }) => {
      const appUrl = await resolveAppUrl(options.home)
      const maxLines = Math.max(1, Number(flags.lines ?? '100') || 100)
      const detail = await fetchRunDetail(appUrl, runId)

      const logFile = join(detail.run.storeFlowDir, 'logs.txt')
      const diskLog = await readFile(logFile, 'utf8').catch(() => '')
      if (diskLog.trim()) {
        const lines = diskLog.trimEnd().split(/\r?\n/).slice(-maxLines)
        for (const line of lines) write(line)
      } else {
        for (const msg of detail.messages.slice(-maxLines)) {
          write(formatWorkerMessage(msg))
        }
      }

      if (!flags.follow || TERMINAL_RUN_STATUSES.has(detail.run.status)) {
        return
      }

      await followRunStream(appUrl, runId, new Set(detail.messages.map((m) => m.id)), write)
    })
}

// Helpers ---------------------------------------------------------------------
async function resolveAppUrl(home?: string): Promise<string> {
  if (process.env.DIFFLAB_APP_URL?.trim()) {
    return process.env.DIFFLAB_APP_URL.trim().replace(/\/$/, '')
  }
  const status = await inspectDaemonStatus(home)
  if (status.running && status.state?.appUrl) {
    return status.state.appUrl.replace(/\/$/, '')
  }
  throw new DifflabError('difflab daemon is not running; start it with `difflab daemon up`')
}

async function fetchRunDetail(appUrl: string, runId: string): Promise<FlowRunDetail> {
  const response = await fetch(`${appUrl}/v1/runs/${encodeURIComponent(runId)}`)
  const body = (await response.json()) as FlowRunDetail & { error?: string }
  if (!response.ok) {
    throw new DifflabError(body.error ?? `Failed to fetch run ${runId} (${response.status})`)
  }
  return body
}

function formatWorkerMessage(msg: {
  level: string
  stepId: string | null
  message: string
}): string {
  return `[${msg.level}]${msg.stepId ? ` ${msg.stepId}:` : ''} ${msg.message}`
}

async function followRunStream(
  appUrl: string,
  runId: string,
  seenMessageIds: Set<string>,
  write: (message: string) => void,
): Promise<void> {
  const abortController = new AbortController()
  const response = await fetch(`${appUrl}/v1/stream?runId=${encodeURIComponent(runId)}`, {
    signal: abortController.signal,
  })
  if (!response.ok || !response.body) {
    throw new DifflabError(`Failed to connect to SSE stream (${response.status})`)
  }

  // Re-check run status immediately after opening SSE to close any race window.
  const latest = await fetchRunDetail(appUrl, runId)
  for (const msg of latest.messages) {
    if (!seenMessageIds.has(msg.id)) {
      seenMessageIds.add(msg.id)
      write(formatWorkerMessage(msg))
    }
  }
  if (TERMINAL_RUN_STATUSES.has(latest.run.status)) {
    abortController.abort()
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawBlock = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        const dataLine = rawBlock.split(/\r?\n/).find((line) => line.startsWith('data: '))
        if (!dataLine) continue

        const payload = JSON.parse(dataLine.slice('data: '.length)) as {
          type: string
          run?: { status: string }
          message?: { id: string; level: string; stepId: string | null; message: string }
        }

        if (payload.type === 'worker.message' && payload.message) {
          if (!seenMessageIds.has(payload.message.id)) {
            seenMessageIds.add(payload.message.id)
            write(formatWorkerMessage(payload.message))
          }
        } else if (payload.type === 'run.updated' && payload.run) {
          if (TERMINAL_RUN_STATUSES.has(payload.run.status)) {
            abortController.abort()
            return
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return
    }
    throw error
  }
}
