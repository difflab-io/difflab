import { randomUUID } from 'node:crypto'
import { type Kysely, type Transaction } from 'kysely'
import {
  validateFlowRun,
  validateFlowStep,
  validateWorkerMessage,
  type FlowRun,
  type FlowRunDetail,
  type FlowStep,
  type WorkerMessage,
} from '../entities/run.js'
import { DifflabDbError, withDatabaseAccess } from '../registry.js'
import { retryDatabaseOperation } from '../retry.js'
import type { ProjectDatabase, RunStatus, StepStatus, WorkerMessageLevel } from '../schema.js'

// Types -----------------------------------------------------------------------
export type CreateRunInput = {
  id: string
  repoId: string
  flowName: string
  triggerKey?: string | null
  harness: string
  storeFlowDir: string
  worktreePath?: string | null
  steps: {
    stepId: string
    seq: number
    harness?: string | null
  }[]
  initialMessage?: string
}

export type UpdateRunStateInput = {
  status?: RunStatus
  worktreePath?: string | null
  herdrSession?: string | null
  herdrPaneId?: string | null
  herdrAgentName?: string | null
  commitSha?: string | null
  step?: {
    stepId: string
    status: StepStatus
    harness?: string | null
    handoff?: string | null
    summary?: string | null
  }
  message?: {
    stepId?: string | null
    level: WorkerMessageLevel
    text: string
  }
}

export type UpdateRunStateResult = {
  run: FlowRun
  step?: FlowStep
  message?: WorkerMessage
}

export class DuplicateTriggerError extends DifflabDbError {
  constructor(triggerKey: string) {
    super(`Workflow trigger was already claimed: ${triggerKey}`)
    this.name = 'DuplicateTriggerError'
  }
}

export class RunConflictError extends DifflabDbError {
  constructor(runId: string) {
    super(`Workflow run already exists: ${runId}`)
    this.name = 'RunConflictError'
  }
}

export class RunNotFoundError extends DifflabDbError {
  constructor(runId: string) {
    super(`Workflow run not found: ${runId}`)
    this.name = 'RunNotFoundError'
  }
}

// API -------------------------------------------------------------------------
export function createRunQueries(db: Kysely<ProjectDatabase>, readonly: boolean, dbPath: string) {
  const assertWritable = () => {
    if (readonly) throw new DifflabDbError('Project database is read-only')
  }

  return {
    async createRun(input: CreateRunInput): Promise<FlowRunDetail> {
      assertWritable()
      const now = new Date().toISOString()
      const triggerKey = input.triggerKey ?? null
      try {
        return await withDatabaseAccess(dbPath, () =>
          retryDatabaseOperation(() =>
            db.transaction().execute(async (tx) => {
              const repo = await tx
                .selectFrom('repositories')
                .select('id')
                .where('id', '=', input.repoId)
                .executeTakeFirst()
              if (!repo) throw new DifflabDbError(`Repository not found: ${input.repoId}`)

              await tx
                .insertInto('runs')
                .values({
                  id: input.id,
                  repo_id: input.repoId,
                  flow_name: input.flowName,
                  trigger_key: triggerKey,
                  status: 'queued',
                  harness: input.harness,
                  worktree_path: input.worktreePath ?? null,
                  store_flow_dir: input.storeFlowDir,
                  herdr_session: null,
                  herdr_pane_id: null,
                  herdr_agent_name: null,
                  commit_sha: null,
                  created_at: now,
                  updated_at: now,
                })
                .execute()

              for (const step of input.steps) {
                await tx
                  .insertInto('steps')
                  .values({
                    id: randomUUID(),
                    run_id: input.id,
                    step_id: step.stepId,
                    seq: step.seq,
                    status: 'pending',
                    harness: step.harness ?? input.harness,
                    handoff: null,
                    summary: null,
                    started_at: null,
                    finished_at: null,
                  })
                  .execute()
              }

              if (input.initialMessage) {
                await tx
                  .insertInto('worker_messages')
                  .values({
                    id: randomUUID(),
                    run_id: input.id,
                    step_id: null,
                    level: 'info',
                    message: input.initialMessage,
                    created_at: now,
                  })
                  .execute()
              }

              return readRunDetail(tx, input.id)
            }),
          ),
        )
      } catch (error) {
        if (isConstraint(error)) {
          if (triggerKey && /trigger_key/i.test(error instanceof Error ? error.message : '')) {
            throw new DuplicateTriggerError(triggerKey)
          }
          // Check whether trigger_key or id caused the constraint violation
          if (triggerKey) {
            const existingByTrigger = await withDatabaseAccess(dbPath, () =>
              db
                .selectFrom('runs')
                .select('id')
                .where('trigger_key', '=', triggerKey)
                .executeTakeFirst(),
            )
            if (existingByTrigger) throw new DuplicateTriggerError(triggerKey)
          }
          throw new RunConflictError(input.id)
        }
        throw error
      }
    },

    async getRun(runId: string): Promise<FlowRunDetail> {
      return withDatabaseAccess(dbPath, () =>
        db.transaction().execute((tx) => readRunDetail(tx, runId)),
      )
    },

    async listRuns(filter: { repoId?: string; status?: RunStatus } = {}): Promise<FlowRun[]> {
      return withDatabaseAccess(dbPath, async () => {
        let query = db.selectFrom('runs').selectAll().orderBy('created_at', 'desc')
        if (filter.repoId) query = query.where('repo_id', '=', filter.repoId)
        if (filter.status) query = query.where('status', '=', filter.status)
        const rows = await query.execute()
        return rows.map(fromDbRun)
      })
    },

    async updateRunState(runId: string, patch: UpdateRunStateInput): Promise<UpdateRunStateResult> {
      assertWritable()
      const now = new Date().toISOString()
      return withDatabaseAccess(dbPath, () =>
        retryDatabaseOperation(() =>
          db.transaction().execute(async (tx) => {
            const current = await tx
              .selectFrom('runs')
              .selectAll()
              .where('id', '=', runId)
              .executeTakeFirst()
            if (!current) throw new RunNotFoundError(runId)

            const runUpdates: Partial<ProjectDatabase['runs']> = { updated_at: now }
            if (patch.status !== undefined) runUpdates.status = patch.status
            if (patch.worktreePath !== undefined) runUpdates.worktree_path = patch.worktreePath
            if (patch.herdrSession !== undefined) runUpdates.herdr_session = patch.herdrSession
            if (patch.herdrPaneId !== undefined) runUpdates.herdr_pane_id = patch.herdrPaneId
            if (patch.herdrAgentName !== undefined)
              runUpdates.herdr_agent_name = patch.herdrAgentName
            if (patch.commitSha !== undefined) runUpdates.commit_sha = patch.commitSha

            await tx.updateTable('runs').set(runUpdates).where('id', '=', runId).execute()

            let updatedStep: FlowStep | undefined
            if (patch.step) {
              const stepRow = await tx
                .selectFrom('steps')
                .selectAll()
                .where('run_id', '=', runId)
                .where('step_id', '=', patch.step.stepId)
                .executeTakeFirst()
              if (!stepRow) {
                throw new DifflabDbError(`Step ${patch.step.stepId} not found in run ${runId}`)
              }
              const stepUpdates: Partial<ProjectDatabase['steps']> = {
                status: patch.step.status,
              }
              if (patch.step.harness !== undefined) stepUpdates.harness = patch.step.harness
              if (patch.step.handoff !== undefined) stepUpdates.handoff = patch.step.handoff
              if (patch.step.summary !== undefined) stepUpdates.summary = patch.step.summary
              if (patch.step.status === 'running' && !stepRow.started_at) {
                stepUpdates.started_at = now
              }
              if (patch.step.status === 'done' || patch.step.status === 'failed') {
                stepUpdates.started_at = stepRow.started_at ?? now
                stepUpdates.finished_at = now
              }
              await tx.updateTable('steps').set(stepUpdates).where('id', '=', stepRow.id).execute()
              const refreshedStep = await tx
                .selectFrom('steps')
                .selectAll()
                .where('id', '=', stepRow.id)
                .executeTakeFirstOrThrow()
              updatedStep = fromDbStep(refreshedStep)
            }

            let createdMessage: WorkerMessage | undefined
            if (patch.message) {
              const msgRow: ProjectDatabase['worker_messages'] = {
                id: randomUUID(),
                run_id: runId,
                step_id: patch.message.stepId ?? patch.step?.stepId ?? null,
                level: patch.message.level,
                message: patch.message.text,
                created_at: now,
              }
              await tx.insertInto('worker_messages').values(msgRow).execute()
              createdMessage = fromDbMessage(msgRow)
            }

            const refreshedRun = await tx
              .selectFrom('runs')
              .selectAll()
              .where('id', '=', runId)
              .executeTakeFirstOrThrow()
            return {
              run: fromDbRun(refreshedRun),
              ...(updatedStep ? { step: updatedStep } : {}),
              ...(createdMessage ? { message: createdMessage } : {}),
            }
          }),
        ),
      )
    },
  }
}

// Helpers ---------------------------------------------------------------------
async function readRunDetail(
  tx: Transaction<ProjectDatabase>,
  runId: string,
): Promise<FlowRunDetail> {
  const runRow = await tx.selectFrom('runs').selectAll().where('id', '=', runId).executeTakeFirst()
  if (!runRow) throw new RunNotFoundError(runId)

  const stepRows = await tx
    .selectFrom('steps')
    .selectAll()
    .where('run_id', '=', runId)
    .orderBy('seq', 'asc')
    .execute()

  const messageRows = await tx
    .selectFrom('worker_messages')
    .selectAll()
    .where('run_id', '=', runId)
    .orderBy('created_at', 'asc')
    .execute()

  return {
    run: fromDbRun(runRow),
    steps: stepRows.map(fromDbStep),
    messages: messageRows.map(fromDbMessage),
  }
}

function fromDbRun(row: ProjectDatabase['runs']): FlowRun {
  return validateFlowRun({
    id: row.id,
    repoId: row.repo_id,
    flowName: row.flow_name,
    triggerKey: row.trigger_key,
    status: row.status,
    harness: row.harness,
    worktreePath: row.worktree_path,
    storeFlowDir: row.store_flow_dir,
    herdrSession: row.herdr_session,
    herdrPaneId: row.herdr_pane_id,
    herdrAgentName: row.herdr_agent_name,
    commitSha: row.commit_sha,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function fromDbStep(row: ProjectDatabase['steps']): FlowStep {
  return validateFlowStep({
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    seq: row.seq,
    status: row.status,
    harness: row.harness,
    handoff: row.handoff,
    summary: row.summary,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  })
}

function fromDbMessage(row: ProjectDatabase['worker_messages']): WorkerMessage {
  return validateWorkerMessage({
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    level: row.level,
    message: row.message,
    createdAt: row.created_at,
  })
}

function isConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    /SQLITE_CONSTRAINT|constraint failed|UNIQUE constraint/i.test(error.message)
  )
}
