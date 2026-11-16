import { json, type RequestHandler } from '@sveltejs/kit'
import { DuplicateTriggerError, harnessKindSchema, runStatusSchema } from 'difflab-db'
import { discoverGitRepository } from 'utils/gitx'
import { z } from 'zod'
import { getAppDb } from '$lib/server/db.js'
import { FlowDefinitionError } from '$lib/server/flow-parser.js'
import { startFlowRun } from '$lib/server/orchestrator.js'

// Constants -------------------------------------------------------------------
const createRunBodySchema = z.object({
  flowName: z.string().min(1),
  repoId: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  inputs: z.record(z.string(), z.string()).optional(),
  flags: z.array(z.string()).optional(),
  harness: harnessKindSchema.optional(),
  triggerKey: z.string().min(1).nullable().optional(),
})

// API -------------------------------------------------------------------------
export const GET: RequestHandler = async ({ url }) => {
  const db = await getAppDb()
  const rawStatus = url.searchParams.get('status')
  const statusParsed = rawStatus ? runStatusSchema.safeParse(rawStatus) : undefined
  if (statusParsed && !statusParsed.success) {
    return json({ error: `Invalid status filter: ${rawStatus}` }, { status: 400 })
  }

  let repoId = url.searchParams.get('repoId') ?? undefined
  const cwd = url.searchParams.get('cwd')
  if (!repoId && cwd) {
    try {
      const git = discoverGitRepository(cwd)
      const repo = await db.repositories.getRepositoryByOrigin(git.originUrl)
      if (!repo) {
        return json({ runs: [] })
      }
      repoId = repo.id
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      )
    }
  }

  const runs = await db.runs.listRuns({
    repoId,
    status: statusParsed?.data,
  })
  return json({ runs })
}

export const POST: RequestHandler = async ({ request, url }) => {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON request body' }, { status: 400 })
  }

  const parsed = createRunBodySchema.safeParse(payload)
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  try {
    const created = await startFlowRun({
      ...parsed.data,
      appOrigin: url.origin,
    })
    return json(created, { status: 201 })
  } catch (error) {
    if (error instanceof DuplicateTriggerError) {
      return json({ error: error.message, deduplicated: true }, { status: 409 })
    }
    if (error instanceof FlowDefinitionError) {
      return json({ error: error.message }, { status: 400 })
    }
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
