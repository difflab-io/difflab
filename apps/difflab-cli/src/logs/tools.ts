import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { StepStatus, WorkerMessageLevel } from 'difflab-db'
import { absolutePath } from 'utils/zodx'
import { z } from 'zod'
import { parseFrozenFlowInstance } from '../flows/flow-markdown.js'
import { defineTool } from '../tools.js'
import { appendProgressLog } from './store.js'

// Constants -------------------------------------------------------------------
const logOutput = z.object({ result: z.object({ path: z.string(), entry: z.string() }) })
const STEP_LOG_REGEX =
  /^Step\s+(\d+)\s+(started|complete|failed):\s+([a-z0-9-]+)(?:\s+[—(-]\s*(.+))?$/i

// API -------------------------------------------------------------------------
export const logTools = [
  defineTool(
    'log_append',
    {
      description:
        'Append one locally timestamped progress line to logs.txt at an absolute physical path. The parent directory must already exist; create the file if absent, never overwrite prior entries.',
      inputSchema: z.strictObject({
        path: absolutePath.describe(
          'Absolute physical path to an existing plan directory/logs.txt',
        ),
        message: z.string().min(1).describe('Single-line progress message'),
      }),
      outputSchema: logOutput,
      annotations: { openWorldHint: false },
    },
    async ({ path, message }) => {
      const result = await appendProgressLog(path, message)
      await dualWriteWorkerProgress(path, message)
      return result
    },
    { toStructuredContent: (result) => ({ result }) },
  ),
]

// Helpers ---------------------------------------------------------------------
async function dualWriteWorkerProgress(logPath: string, message: string): Promise<void> {
  const appUrl = process.env.DIFFLAB_APP_URL?.trim()
  const runId = process.env.DIFFLAB_RUN_ID?.trim()
  if (!appUrl || !runId) return

  const stepMatch = STEP_LOG_REGEX.exec(message.trim())
  let stepId = process.env.DIFFLAB_STEP_ID?.trim() || null
  let level: WorkerMessageLevel = 'info'
  let stepPatch:
    | {
        seq: number
        stepId: string
        status: StepStatus
        summary?: string
      }
    | undefined

  if (stepMatch) {
    const seq = Number(stepMatch[1])
    const phase = stepMatch[2]!.toLowerCase()
    const matchedStepId = stepMatch[3]!
    stepId = matchedStepId
    if (phase === 'started') {
      level = 'info'
      stepPatch = { seq, stepId: matchedStepId, status: 'running' }
    } else if (phase === 'complete') {
      level = 'done'
      stepPatch = { seq, stepId: matchedStepId, status: 'done' }
    } else if (phase === 'failed') {
      level = 'error'
      stepPatch = { seq, stepId: matchedStepId, status: 'failed', summary: message }
    }
  }

  const siblingFlowMd = join(dirname(logPath), 'FLOW.md')
  const flowRaw = await readFile(siblingFlowMd, 'utf8').catch(() => null)
  const parsedFlow = flowRaw
    ? parseFrozenFlowInstance(
        flowRaw,
        stepPatch?.status === 'running' ? stepPatch.stepId : undefined,
      )
    : null

  const body: Record<string, unknown> = {
    message: {
      stepId,
      level,
      text: message,
    },
  }
  if (parsedFlow?.steps.length) {
    body.steps = parsedFlow.steps
  }
  if (stepPatch) {
    const fromFlow = parsedFlow?.steps.find((s) => s.stepId === stepPatch.stepId)
    body.step = {
      ...stepPatch,
      ...(fromFlow?.handoff ? { handoff: fromFlow.handoff } : {}),
    }
  }

  await fetch(`${appUrl.replace(/\/$/, '')}/v1/runs/${encodeURIComponent(runId)}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined)
}
