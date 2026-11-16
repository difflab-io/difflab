import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
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
  dispatchStepToDaemon,
  resolveDaemonUrls,
} from './daemon-client.js'
import { getAppDb, resolveStorePaths } from './db.js'
import {
  loadFlowDefinition,
  resolveFlowExecutionPlan,
  resolveStepHandoffTokens,
  type ResolvedFlowPlan,
} from './flow-parser.js'
import { publishFlowEvent } from './hub.js'

// Constants -------------------------------------------------------------------
const activePlans = new Map<string, ActivePlanMeta>()

// Types -----------------------------------------------------------------------
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

type ActivePlanMeta = {
  repoRoot: string
  projectKey: string
  repoSlug: string
  retention: WorktreeRetention
  plan: ResolvedFlowPlan
  appOrigin: string
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

  const repoConfig = await loadRepoConfigIfPresent(repoRoot)
  const defaultHarness: HarnessKind =
    request.harness ?? repoConfig?.flows?.defaultHarness ?? 'claude'
  const retention: WorktreeRetention = repoConfig?.flows?.retention ?? 'on-success'

  const definition = await loadFlowDefinition(paths.flows, request.flowName)
  const plan = resolveFlowExecutionPlan(definition, request.inputs ?? {}, request.flags ?? [])

  const runId = generateRunId(request.flowName)
  const storeFlowDir = join(paths.projects, repo.projectId, repo.slug, 'flows', runId)

  const created = await db.runs.createRun({
    id: runId,
    repoId: repo.id,
    flowName: request.flowName,
    triggerKey: request.triggerKey ?? null,
    harness: defaultHarness,
    storeFlowDir,
    steps: plan.selectedSteps.map((step) => ({
      stepId: step.stepId,
      seq: step.seq,
      harness: step.harness ?? defaultHarness,
    })),
    initialMessage: `Queued ${request.flowName} (${plan.selectedSteps.length} step${plan.selectedSteps.length === 1 ? '' : 's'})`,
  })

  activePlans.set(runId, {
    repoRoot,
    projectKey: repo.projectId,
    repoSlug: repo.slug,
    retention,
    plan,
    appOrigin: request.appOrigin,
  })

  publishFlowEvent({ type: 'run.updated', runId, run: created.run })
  if (created.messages[0]) {
    publishFlowEvent({ type: 'worker.message', runId, message: created.messages[0] })
  }

  // Dispatch Step 1 asynchronously so HTTP callers receive 201 immediately while rig starts.
  void dispatchNextPendingStep(runId, created).catch(async (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    await applyRunStateUpdate(
      runId,
      {
        status: 'failed',
        message: { level: 'error', text: `Failed to dispatch step: ${reason}` },
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
  if (issue.state.trim().toLowerCase() !== 'ready') {
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
          harness: trigger.harness ?? config?.flows?.defaultHarness,
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
  if (updated.step) {
    publishFlowEvent({ type: 'step.updated', runId, step: updated.step })
  }
  if (updated.message) {
    publishFlowEvent({ type: 'worker.message', runId, message: updated.message })
  }

  // Advance orchestration state machine when a step finishes or fails.
  if (patch.step?.status === 'done') {
    const full = await db.runs.getRun(runId)
    const nextPending = full.steps.find((s) => s.status === 'pending')
    if (nextPending) {
      void dispatchNextPendingStep(runId, full, appOrigin).catch(async (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error)
        const failed = await db.runs.updateRunState(runId, {
          status: 'failed',
          message: { level: 'error', text: `Failed to dispatch ${nextPending.stepId}: ${reason}` },
        })
        publishFlowEvent({ type: 'run.updated', runId, run: failed.run })
        if (failed.message) {
          publishFlowEvent({ type: 'worker.message', runId, message: failed.message })
        }
      })
    } else if (full.run.status !== 'done') {
      const completed = await db.runs.updateRunState(runId, {
        status: 'done',
        message: { level: 'done', text: `Flow ${full.run.flowName} completed` },
      })
      publishFlowEvent({ type: 'run.updated', runId, run: completed.run })
      if (completed.message) {
        publishFlowEvent({ type: 'worker.message', runId, message: completed.message })
      }
      await triggerWorktreeCleanup(runId, completed.run.worktreePath, 'done', appOrigin)
      activePlans.delete(runId)
      return completed
    }
  } else if (
    patch.step?.status === 'failed' ||
    patch.status === 'failed' ||
    patch.status === 'blocked'
  ) {
    const finalStatus = patch.status ?? 'failed'
    if (updated.run.status !== finalStatus) {
      const marked = await db.runs.updateRunState(runId, { status: finalStatus })
      publishFlowEvent({ type: 'run.updated', runId, run: marked.run })
      await triggerWorktreeCleanup(runId, marked.run.worktreePath, finalStatus, appOrigin)
      activePlans.delete(runId)
      return marked
    }
    await triggerWorktreeCleanup(runId, updated.run.worktreePath, finalStatus, appOrigin)
    activePlans.delete(runId)
  }

  return updated
}

// Helpers ---------------------------------------------------------------------
async function dispatchNextPendingStep(
  runId: string,
  detail: FlowRunDetail,
  fallbackOrigin?: string,
): Promise<void> {
  const meta = await ensurePlanMeta(runId, detail, fallbackOrigin ?? 'http://127.0.0.1:4317')
  const nextStepRow = detail.steps.find((s) => s.status === 'pending')
  if (!nextStepRow) return

  const stepSpec = meta.plan.selectedSteps.find((s) => s.stepId === nextStepRow.stepId)
  if (!stepSpec) {
    throw new Error(`Selected step spec missing for ${nextStepRow.stepId}`)
  }

  const completedHandoffs: Record<string, string> = {}
  for (const s of detail.steps) {
    if (s.status === 'done' && s.handoff) {
      completedHandoffs[s.stepId] = s.handoff
    }
  }

  const { daemonRigUrl, appUrl } = await resolveDaemonUrls(meta.appOrigin)
  await dispatchStepToDaemon(daemonRigUrl, {
    runId,
    repoId: detail.run.repoId,
    repoRoot: meta.repoRoot,
    projectKey: meta.projectKey,
    repoSlug: meta.repoSlug,
    storeFlowDir: detail.run.storeFlowDir,
    flowName: detail.run.flowName,
    definitionPath: meta.plan.definition.definitionPath,
    definitionSha256: meta.plan.definition.sha256,
    resolvedInputs: meta.plan.resolvedInputs,
    enabledFlags: meta.plan.enabledFlags,
    disabledFlags: meta.plan.disabledFlags,
    omittedSteps: meta.plan.omittedSteps,
    allSelectedSteps: meta.plan.selectedSteps,
    step: {
      stepId: stepSpec.stepId,
      seq: stepSpec.seq,
      handler: stepSpec.handler,
      harness: nextStepRow.harness ?? detail.run.harness,
      receives: resolveStepHandoffTokens(stepSpec.receivesTemplate, completedHandoffs),
      produces: stepSpec.produces,
      instructions: resolveStepHandoffTokens(stepSpec.instructionsTemplate, completedHandoffs),
    },
    appUrl,
    retention: meta.retention,
  })
}

async function ensurePlanMeta(
  runId: string,
  detail: FlowRunDetail,
  appOrigin: string,
): Promise<ActivePlanMeta> {
  const cached = activePlans.get(runId)
  if (cached) return cached

  const db = await getAppDb()
  const paths = resolveStorePaths()
  const repo = await db.repositories.getRepositoryById(detail.run.repoId)
  const repoRoot = repo.localPath
  if (!repoRoot) throw new Error(`Repository ${repo.url} has no localPath`)
  const config = await loadRepoConfigIfPresent(repoRoot)
  const definition = await loadFlowDefinition(paths.flows, detail.run.flowName)
  const plan = resolveFlowExecutionPlan(definition, { input: detail.run.flowName }, [])
  const rebuilt: ActivePlanMeta = {
    repoRoot,
    projectKey: repo.projectId,
    repoSlug: repo.slug,
    retention: config?.flows?.retention ?? 'on-success',
    plan,
    appOrigin,
  }
  activePlans.set(runId, rebuilt)
  return rebuilt
}

async function triggerWorktreeCleanup(
  runId: string,
  worktreePath: string | null,
  finalStatus: string,
  appOrigin: string,
): Promise<void> {
  const meta = activePlans.get(runId)
  if (!meta || !worktreePath) return
  try {
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
