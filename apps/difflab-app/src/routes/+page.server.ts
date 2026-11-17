import { RunNotFoundError, type FlowRunDetail } from 'difflab-db'
import type { DifflabAppId } from 'ui'
import type { PageServerLoad } from './$types'
import { getAppDb } from '$lib/server/db.js'
import { syncDiskFlowRunsToDb } from '$lib/server/disk-sync.js'
import { loadWorkspaceSnapshot } from '$lib/server/workspace-data.js'

// Constants -------------------------------------------------------------------
const VALID_APPS = new Set<DifflabAppId>(['home', 'wikis', 'tasks', 'plans', 'reviews', 'flows'])

// API -------------------------------------------------------------------------
export const load: PageServerLoad = async ({ url }) => {
  await syncDiskFlowRunsToDb()
  const db = await getAppDb()
  const runs = await db.runs.listRuns()
  const workspace = await loadWorkspaceSnapshot(runs)

  const explicitRunId = url.searchParams.get('runId')
  const requestedAppParam = url.searchParams.get('app') as DifflabAppId | null
  const initialApp: DifflabAppId =
    requestedAppParam && VALID_APPS.has(requestedAppParam)
      ? requestedAppParam
      : explicitRunId
        ? 'flows'
        : 'home'

  const runFromParam = explicitRunId ? runs.find((r) => r.id === explicitRunId) : undefined
  const projectFromParam = url.searchParams.get('project')?.toUpperCase() ?? null
  const initialProjectId =
    (projectFromParam && workspace.projects.some((p) => p.id === projectFromParam)
      ? projectFromParam
      : null) ??
    (runFromParam ? workspace.repoProjectMap[runFromParam.repoId] : null) ??
    workspace.projects[0]?.id ??
    null

  const projectRuns = initialProjectId
    ? runs.filter((r) => workspace.repoProjectMap[r.repoId] === initialProjectId)
    : runs
  const requestedRunId = explicitRunId ?? projectRuns[0]?.id ?? runs[0]?.id ?? null

  let initialDetail: FlowRunDetail | null = null
  if (requestedRunId) {
    try {
      initialDetail = await db.runs.getRun(requestedRunId)
    } catch (error) {
      if (!(error instanceof RunNotFoundError)) throw error
    }
  }

  return {
    runs,
    workspace,
    repoLabels: workspace.repoLabels,
    initialApp,
    initialProjectId,
    initialDetail,
  }
}
