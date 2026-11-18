import { json, type RequestHandler } from '@sveltejs/kit'
import { z } from 'zod'
import { handleLinearReadyTrigger } from '$lib/server/orchestrator.js'

// Constants -------------------------------------------------------------------
const linearIssueSchema = z.object({
  id: z.string().min(1),
  identifier: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  state: z.string().min(1),
  team: z.string().optional(),
  agent: z.string().optional(),
  assignee: z.string().optional(),
  labels: z.array(z.string()).optional(),
})

const triggerPayloadSchema = z.union([
  linearIssueSchema,
  z.object({ issues: z.array(linearIssueSchema) }),
])

// API -------------------------------------------------------------------------
export const POST: RequestHandler = async ({ request, url }) => {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON request body' }, { status: 400 })
  }

  const parsed = triggerPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid trigger payload' },
      { status: 400 },
    )
  }

  const issues = 'issues' in parsed.data ? parsed.data.issues : [parsed.data]
  try {
    const results = []
    for (const issue of issues) {
      const outcomes = await handleLinearReadyTrigger(issue, url.origin)
      results.push({ identifier: issue.identifier, outcomes })
    }
    return json({ results })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
