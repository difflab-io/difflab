import { json, type RequestHandler } from '@sveltejs/kit'
import { RunNotFoundError } from 'difflab-db'
import { getAppDb } from '$lib/server/db.js'

// API -------------------------------------------------------------------------
export const GET: RequestHandler = async ({ params }) => {
  const runId = params.id
  if (!runId) {
    return json({ error: 'Missing run ID' }, { status: 400 })
  }

  const db = await getAppDb()
  try {
    const detail = await db.runs.getRun(runId)
    return json(detail)
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return json({ error: error.message }, { status: 404 })
    }
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
