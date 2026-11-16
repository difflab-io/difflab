import { RunNotFoundError, type FlowRunDetail } from 'difflab-db'
import type { PageServerLoad } from './$types'
import { getAppDb } from '$lib/server/db.js'

// API -------------------------------------------------------------------------
export const load: PageServerLoad = async ({ url }) => {
  const db = await getAppDb()
  const runs = await db.runs.listRuns()
  const requestedId = url.searchParams.get('runId') ?? runs[0]?.id ?? null

  let initialDetail: FlowRunDetail | null = null
  if (requestedId) {
    try {
      initialDetail = await db.runs.getRun(requestedId)
    } catch (error) {
      if (!(error instanceof RunNotFoundError)) throw error
    }
  }

  return {
    runs,
    initialDetail,
  }
}
