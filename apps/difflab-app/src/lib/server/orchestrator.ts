import { randomBytes } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DuplicateTriggerError,
  repoConfigSchema,
  type FlowRunDetail,
  type HarnessKind,
  type LinearReadyTrigger,
  type RepoConfig,
  type Repository,
  type UpdateRunStateInput,
  type UpdateRunStateResult,
  type WorktreeRetention,
} from 'difflab-db'
import { discoverGitRepository } from 'utils/gitx'
import { parseDocument } from 'yaml'
import {
  dispatchCleanupToDaemon,
  dispatchFlowToDaemon,
  resolveDaemonUrls,
} from './daemon-client.js'
import { getAppDb, resolveStorePaths } from './db.js'
import { publishFlowEvent } from './hub.js'

// Constants -------------------------------------------------------------------
const SAFE_FLOW_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const READY_ISSUE_STATES = new Set(['ready', 'todo'])
const TERMINAL_RUN_STATUSES = new Set(['done', 'failed', 'blocked'])
const activeRunMeta = new Map<string, ActiveRunMeta>()

// Types -----------------------------------------------------------------------
export class FlowDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlowDefinitionError'
  }
}

export type StartFlowRunRequest = {
  flowName: string
  repoId?: string
  cwd?: string
  inputs?: Record<string, string>
  flags?: string[]
  harness?: HarnessKind
  triggerKey?: string | null
  appOrigin: string
}

export type LinearCandidateIssue = {
  id: string
  identifier: string
  title: string
  description?: string
  state: string
  team?: string
  agent?: string
  assignee?: string
  labels?: string[]
}

export type LinearTriggerOutcome = {
  matched: boolean
  deduplicated?: boolean
  runId?: string
}

type ActiveRunMeta = {
  repoRoot: string
  retention: WorktreeRetention
}

// API -------------------------------------------------------------------------
export async function startFlowRun(request: StartFlowRunRequest): Promise<FlowRunDetail> {
  const db = await getAppDb()
  const paths = resolveStorePaths()
  const repo = await resolveTargetRepository(request.repoId, request.cwd)
  const repoRoot = request.cwd ? discoverGitRepository(request.cwd).root : repo.localPath
  if (!repoRoot) {
    throw new Error(
      `Repository ${repo.url} has no local checkout path; run difflab init inside the checkout first`,
    )
  }

  const definitionPath = await verifyFlowDefinitionPath(paths.flows, request.flowName)
  const repoConfig = await loadRepoConfigIfPresent(repoRoot)
  const harness: HarnessKind = request.harness ?? repoConfig?.flows?.defaultHarness ?? 'agy'
  const retention: WorktreeRetention = repoConfig?.flows?.retention ?? 'on-success'

  const runId = generateRunId(request.flowName)
  const storeFlowDir = join(paths.projects, repo.projectId, repo.slug, 'flows', runId)

  const created = await db.runs.createRun({
    id: runId,
    repoId: repo.id,
    flowName: request.flowName,
    triggerKey: request.triggerKey ?? null,
    harness,
    storeFlowDir,
    steps: [],
    initialMessage: `Queued ${request.flowName} on ${harness}`,
  })

  activeRunMeta.set(runId, { repoRoot, retention })

  publishFlowEvent({ type: 'run.updated', runId, run: created.run })
  if (created.messages[0]) {
    publishFlowEvent({ type: 'worker.message', runId, message: created.messages[0] })
  }

  // Dispatch whole flow execution asynchronously so HTTP callers receive 201 immediately.
  void (async () => {
    const { daemonRigUrl, appUrl } = await resolveDaemonUrls(request.appOrigin)
    await dispatchFlowToDaemon(daemonRigUrl, {
      runId,
      repoId: repo.id,
      repoRoot,
      projectKey: repo.projectId,
      repoSlug: repo.slug,
      storeFlowDir,
      flowName: request.flowName,
      definitionPath,
      inputs: request.inputs ?? {},
      flags: request.flags ?? [],
      harness,
      appUrl,
      retention,
    })
  })().catch(async (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    await applyRunStateUpdate(
      runId,
      {
        status: 'failed',
        message: { level: 'error', text: `Failed to dispatch flow to daemon: ${reason}` },
      },
      request.appOrigin,
    ).catch(() => undefined)
  })

  return created
}

export async function handleLinearReadyTrigger(
  issue: LinearCandidateIssue,
  appOrigin: string,
): Promise<LinearTriggerOutcome[]> {
  if (!READY_ISSUE_STATES.has(issue.state.trim().toLowerCase())) {
    return [{ matched: false }]
  }

  const db = await getAppDb()
  const repos = await db.repositories.listRepositories()
  const outcomes: LinearTriggerOutcome[] = []

  for (const repo of repos) {
    if (!repo.localPath) continue
    const config = await loadRepoConfigIfPresent(repo.localPath)
    const triggers = config?.flows?.triggers ?? []
    for (const trigger of triggers) {
      if (!matchesLinearTrigger(trigger, issue)) continue
      const triggerKey = `linear:${issue.identifier}:ready:${trigger.flow}`
      const promptInput = `${issue.identifier}: ${issue.title}${issue.description ? `\n\n${issue.description}` : ''}`
      try {
        const started = await startFlowRun({
          flowName: trigger.flow,
          repoId: repo.id,
          cwd: repo.localPath,
          inputs: { input: promptInput },
          flags: trigger.flags ?? [],
          harness: trigger.harness ?? config?.flows?.defaultHarness ?? 'agy',
          triggerKey,
          appOrigin,
        })
        outcomes.push({ matched: true, deduplicated: false, runId: started.run.id })
      } catch (error) {
        if (error instanceof DuplicateTriggerError) {
          outcomes.push({ matched: true, deduplicated: true })
          continue
        }
        throw error
      }
    }
  }

  return outcomes.length ? outcomes : [{ matched: false }]
}

export async function applyRunStateUpdate(
  runId: string,
  patch: UpdateRunStateInput,
  appOrigin: string,
): Promise<UpdateRunStateResult> {
  const db = await getAppDb()
  const updated = await db.runs.updateRunState(runId, patch)

  publishFlowEvent({ type: 'run.updated', runId, run: updated.run })
  if (updated.steps?.length) {
    for (const step of updated.steps) {
      publishFlowEvent({ type: 'step.updated', runId, step })
    }
  }
  if (updated.step) {
    publishFlowEvent({ type: 'step.updated', runId, step: updated.step })
  }
  if (updated.message) {
    publishFlowEvent({ type: 'worker.message', runId, message: updated.message })
  }

  if (patch.status && TERMINAL_RUN_STATUSES.has(patch.status)) {
    await triggerWorktreeCleanup(
      runId,
      updated.run.repoId,
      updated.run.worktreePath,
      patch.status,
      appOrigin,
    )
    activeRunMeta.delete(runId)
  }

  return updated
}

// Helpers ---------------------------------------------------------------------
async function verifyFlowDefinitionPath(flowsDir: string, flowName: string): Promise<string> {
  if (!SAFE_FLOW_NAME.test(flowName)) {
    throw new FlowDefinitionError(`Unsafe flow name '${flowName}'; expected hyphenated lowercase`)
  }
  const flowsStat = await lstat(flowsDir).catch(() => null)
  if (!flowsStat || flowsStat.isSymbolicLink() || !flowsStat.isDirectory()) {
    throw new FlowDefinitionError(`Missing or invalid global flows directory: ${flowsDir}`)
  }
  const definitionPath = join(flowsDir, `${flowName}.md`)
  const defStat = await lstat(definitionPath).catch(() => null)
  if (!defStat || defStat.isSymbolicLink() || !defStat.isFile()) {
    throw new FlowDefinitionError(`Flow definition not found: ${definitionPath}`)
  }
  const raw = await readFile(definitionPath, 'utf8')
  if (!raw.trim()) {
    throw new FlowDefinitionError(`Flow definition is empty: ${definitionPath}`)
  }
  return definitionPath
}

async function triggerWorktreeCleanup(
  runId: string,
  repoId: string,
  worktreePath: string | null,
  finalStatus: string,
  appOrigin: string,
): Promise<void> {
  if (!worktreePath) return
  try {
    let meta = activeRunMeta.get(runId)
    if (!meta) {
      const db = await getAppDb()
      const repo = await db.repositories.getRepositoryById(repoId)
      if (!repo.localPath) return
      const config = await loadRepoConfigIfPresent(repo.localPath)
      meta = {
        repoRoot: repo.localPath,
        retention: config?.flows?.retention ?? 'on-success',
      }
    }
    const { daemonRigUrl } = await resolveDaemonUrls(appOrigin)
    await dispatchCleanupToDaemon(daemonRigUrl, {
      runId,
      repoRoot: meta.repoRoot,
      worktreePath,
      retention: meta.retention,
      finalStatus,
    })
  } catch {
    // Cleanup is best-effort if daemon already stopped.
  }
}

async function resolveTargetRepository(repoId?: string, cwd?: string): Promise<Repository> {
  const db = await getAppDb()
  if (repoId) return db.repositories.getRepositoryById(repoId)
  if (cwd) {
    const git = discoverGitRepository(cwd)
    const found = await db.repositories.getRepositoryByOrigin(git.originUrl)
    if (!found) {
      throw new Error(`Repository at ${git.root} is not initialized in Difflab; run difflab init`)
    }
    return found
  }
  const all = await db.repositories.listRepositories()
  if (all.length === 1) return all[0]!
  throw new Error('Specify repoId or --cwd to select the target repository')
}

async function loadRepoConfigIfPresent(repoRoot: string): Promise<RepoConfig | null> {
  try {
    const raw = await readFile(join(repoRoot, 'difflab.yaml'), 'utf8')
    const parsed = parseDocument(raw, { uniqueKeys: true, strict: true }).toJS({ maxAliasCount: 0 })
    const validated = repoConfigSchema.safeParse(parsed)
    return validated.success ? validated.data : null
  } catch {
    return null
  }
}

function matchesLinearTrigger(trigger: LinearReadyTrigger, issue: LinearCandidateIssue): boolean {
  if (trigger.team && trigger.team.toLowerCase() !== (issue.team ?? '').toLowerCase()) {
    return false
  }
  if (trigger.agent) {
    const candidateAgent = (issue.agent ?? issue.assignee ?? '').toLowerCase()
    if (candidateAgent !== trigger.agent.toLowerCase()) return false
  }
  if (trigger.labels?.length) {
    const issueLabels = new Set((issue.labels ?? []).map((label) => label.toLowerCase()))
    for (const required of trigger.labels) {
      if (!issueLabels.has(required.toLowerCase())) return false
    }
  }
  return true
}

function generateRunId(flowName: string): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const suffix = randomBytes(2).toString('hex')
  return `${yy}${mm}${dd}-${flowName}-${suffix}`
}
