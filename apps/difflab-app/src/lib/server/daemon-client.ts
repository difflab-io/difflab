import { readFile } from 'node:fs/promises'
import type { WorktreeRetention } from 'difflab-db'
import { resolveStorePaths } from './db.js'
import type { ResolvedFlowStep } from './flow-parser.js'

// Types -----------------------------------------------------------------------
export type RigExecutePayload = {
  runId: string
  repoId: string
  repoRoot: string
  projectKey: string
  repoSlug: string
  storeFlowDir: string
  flowName: string
  definitionPath: string
  definitionSha256: string
  resolvedInputs: Record<string, string>
  enabledFlags: string[]
  disabledFlags: string[]
  omittedSteps: { stepId: string; reason: string }[]
  allSelectedSteps: ResolvedFlowStep[]
  step: {
    stepId: string
    seq: number
    handler: string
    harness: string
    receives: string
    produces: string
    instructions: string
  }
  appUrl: string
  retention: WorktreeRetention
}

export type RigCleanupPayload = {
  runId: string
  repoRoot: string
  worktreePath: string | null
  retention: WorktreeRetention
  finalStatus: string
}

// API -------------------------------------------------------------------------
export async function resolveDaemonUrls(
  fallbackAppOrigin: string,
): Promise<{ daemonRigUrl: string; appUrl: string }> {
  if (process.env.DIFFLAB_DAEMON_RIG_URL) {
    return {
      daemonRigUrl: process.env.DIFFLAB_DAEMON_RIG_URL,
      appUrl: process.env.DIFFLAB_APP_URL ?? fallbackAppOrigin,
    }
  }
  const paths = resolveStorePaths()
  try {
    const raw = JSON.parse(await readFile(paths.daemonState, 'utf8')) as {
      daemonRigUrl?: string
      appUrl?: string
    }
    if (raw.daemonRigUrl) {
      return {
        daemonRigUrl: raw.daemonRigUrl,
        appUrl: raw.appUrl ?? fallbackAppOrigin,
      }
    }
  } catch {
    // Fall through to explicit error below when no daemon state is present.
  }
  throw new Error('No active difflab daemon rig URL found; start it with `difflab daemon up`')
}

export async function dispatchStepToDaemon(
  daemonRigUrl: string,
  payload: RigExecutePayload,
): Promise<void> {
  const response = await fetch(`${daemonRigUrl.replace(/\/$/, '')}/v1/rig/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Daemon rig execute rejected (${response.status}): ${body}`)
  }
}

export async function dispatchCleanupToDaemon(
  daemonRigUrl: string,
  payload: RigCleanupPayload,
): Promise<void> {
  await fetch(`${daemonRigUrl.replace(/\/$/, '')}/v1/rig/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined)
}
