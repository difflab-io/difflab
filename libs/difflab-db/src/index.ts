import { migrate, assertCurrentSchema } from './migrations.js'
import { openDatabase } from './registry.js'
import { createProjectQueries } from './queries/projects.js'
import { createRepositoryQueries } from './queries/repositories.js'
import { createRunQueries } from './queries/runs.js'
import type { Project, Repository } from './queries/projects.js'

// Types -----------------------------------------------------------------------
export interface DifflabDb {
  projects: ReturnType<typeof createProjectQueries>
  repositories: ReturnType<typeof createRepositoryQueries>
  runs: ReturnType<typeof createRunQueries>
  migrate: () => Promise<void>
  assertCurrentSchema: () => Promise<void>
  close: () => Promise<void>
}

// API -------------------------------------------------------------------------
export async function createDifflabDb(
  dbPath: string,
  options: { readonly?: boolean } = {},
): Promise<DifflabDb> {
  const readonly = options.readonly ?? false
  const db = await openDatabase(dbPath, readonly)
  const projects = createProjectQueries(db, readonly, dbPath)
  const repositories = createRepositoryQueries(db, readonly, dbPath)
  const runs = createRunQueries(db, readonly, dbPath)
  return {
    projects,
    repositories,
    runs,
    migrate: () => migrate(db),
    assertCurrentSchema: () => assertCurrentSchema(db),
    close: () => db.destroy(),
  }
}

export type { Project, Repository }
export type { RunStatus, StepStatus, WorkerMessageLevel } from './schema.js'
export type { FlowRun, FlowStep, WorkerMessage, FlowRunDetail } from './entities/run.js'
export type {
  HarnessKind,
  WorktreeRetention,
  LinearReadyTrigger,
  RepoFlowsConfig,
  RepoConfig,
} from './entities/repo-config.js'
export type { CreateRunInput, UpdateRunStateInput, UpdateRunStateResult } from './queries/runs.js'
export { ProjectConflictError, validateProjectKey } from './queries/projects.js'
export { DuplicateTriggerError, RunConflictError, RunNotFoundError } from './queries/runs.js'
export { canonicalGitUrl, repositorySlug } from 'utils/gitx'
export { DifflabDbError } from './registry.js'
export { MigrationError } from './migrations.js'
export { projectSchema, validateProject } from './entities/project.js'
export { repositorySchema, validateRepository } from './entities/repository.js'
export {
  harnessKindSchema,
  worktreeRetentionSchema,
  linearReadyTriggerSchema,
  repoFlowsConfigSchema,
  repoConfigSchema,
} from './entities/repo-config.js'
export {
  runStatusSchema,
  stepStatusSchema,
  workerMessageLevelSchema,
  flowRunSchema,
  flowStepSchema,
  workerMessageSchema,
  validateFlowRun,
  validateFlowStep,
  validateWorkerMessage,
} from './entities/run.js'
