import { stepStatusSchema, workerMessageLevelSchema } from 'difflab-db'
import { z } from 'zod'
import { DifflabError } from '../errors.js'
import { defineTool } from '../tools.js'

// Constants -------------------------------------------------------------------
const flowStateOutput = z.object({
  result: z.object({
    updated: z.boolean(),
    runId: z.string(),
    status: z.string(),
  }),
})

// API -------------------------------------------------------------------------
export const flowTools = [
  defineTool(
    'flow_state_update',
    {
      description:
        'Publish live step progress, handoff values, or worker messages for an active Difflab flow run to difflab-app.',
      inputSchema: z.strictObject({
        runId: z.string().min(1).optional().describe('Flow run ID; defaults to DIFFLAB_RUN_ID'),
        stepId: z.string().min(1).optional().describe('Step ID; defaults to DIFFLAB_STEP_ID'),
        stepStatus: stepStatusSchema.optional().describe('Updated step status'),
        handoff: z.string().optional().describe('Verified step output handoff string'),
        summary: z.string().optional().describe('Concise human-readable step summary'),
        message: z.string().min(1).optional().describe('Worker message to broadcast'),
        level: workerMessageLevelSchema.optional().describe('Worker message level'),
        commitSha: z.string().min(1).optional().describe('Verified local Git commit SHA'),
      }),
      outputSchema: flowStateOutput,
      annotations: { openWorldHint: false },
    },
    async (input) => {
      const appUrl = process.env.DIFFLAB_APP_URL?.trim()
      if (!appUrl) {
        throw new DifflabError('DIFFLAB_APP_URL is not set; start `difflab daemon up` first')
      }
      const runId = input.runId ?? process.env.DIFFLAB_RUN_ID?.trim()
      if (!runId) {
        throw new DifflabError('runId is required when DIFFLAB_RUN_ID is not set')
      }
      const stepId = input.stepId ?? process.env.DIFFLAB_STEP_ID?.trim()

      const patch: Record<string, unknown> = {}
      if (input.commitSha) patch.commitSha = input.commitSha
      if (input.stepStatus) {
        if (!stepId) {
          throw new DifflabError('stepId is required when updating stepStatus')
        }
        patch.step = {
          stepId,
          status: input.stepStatus,
          ...(input.handoff !== undefined ? { handoff: input.handoff } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
        }
      }
      if (input.message) {
        patch.message = {
          stepId: stepId ?? null,
          level: input.level ?? 'info',
          text: input.message,
        }
      }

      const response = await fetch(
        `${appUrl.replace(/\/$/, '')}/v1/runs/${encodeURIComponent(runId)}/state`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      )
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new DifflabError(`difflab-app state update failed (${response.status}): ${body}`)
      }
      const updated = (await response.json()) as { run?: { status?: string } }
      return {
        updated: true,
        runId,
        status: updated.run?.status ?? 'running',
      }
    },
    { toStructuredContent: (result) => ({ result }) },
  ),
]
