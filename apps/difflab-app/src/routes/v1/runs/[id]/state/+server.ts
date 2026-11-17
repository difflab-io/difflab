import { json, type RequestHandler } from '@sveltejs/kit'
import {
  RunNotFoundError,
  runStatusSchema,
  stepStatusSchema,
  workerMessageLevelSchema,
} from 'difflab-db'
import { z } from 'zod'
import { applyRunStateUpdate } from '$lib/server/orchestrator.js'

// Constants -------------------------------------------------------------------
const stepPatchSchema = z.object({
  stepId: z.string().min(1),
  seq: z.number().int().positive().optional(),
  status: stepStatusSchema,
  harness: z.string().nullable().optional(),
  handoff: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
})

const statePatchSchema = z.object({
  status: runStatusSchema.optional(),
  worktreePath: z.string().nullable().optional(),
  herdrSession: z.string().nullable().optional(),
  herdrPaneId: z.string().nullable().optional(),
  herdrAgentName: z.string().nullable().optional(),
  commitSha: z.string().nullable().optional(),
  step: stepPatchSchema.optional(),
  steps: z
    .array(
      stepPatchSchema.extend({
        seq: z.number().int().positive(),
      }),
    )
    .optional(),
  message: z
    .object({
      stepId: z.string().nullable().optional(),
      level: workerMessageLevelSchema,
      text: z.string().min(1),
    })
    .optional(),
})

// API -------------------------------------------------------------------------
export const POST: RequestHandler = async ({ params, request, url }) => {
  const runId = params.id
  if (!runId) {
    return json({ error: 'Missing run ID' }, { status: 400 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON request body' }, { status: 400 })
  }

  const parsed = statePatchSchema.safeParse(payload)
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid patch' }, { status: 400 })
  }

  try {
    const updated = await applyRunStateUpdate(runId, parsed.data, url.origin)
    return json(updated)
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return json({ error: error.message }, { status: 404 })
    }
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
