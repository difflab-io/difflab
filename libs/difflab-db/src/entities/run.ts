import { z } from 'zod'

// Constants -------------------------------------------------------------------
export const runStatusSchema = z.enum(['queued', 'running', 'blocked', 'done', 'failed'])
export const stepStatusSchema = z.enum(['pending', 'running', 'done', 'failed'])
export const workerMessageLevelSchema = z.enum(['info', 'blocker', 'done', 'error'])

export const flowRunSchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1),
  flowName: z.string().min(1),
  triggerKey: z.string().nullable(),
  status: runStatusSchema,
  harness: z.string().min(1),
  worktreePath: z.string().nullable(),
  storeFlowDir: z.string().min(1),
  herdrSession: z.string().nullable(),
  herdrPaneId: z.string().nullable(),
  herdrAgentName: z.string().nullable(),
  commitSha: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const flowStepSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  stepId: z.string().min(1),
  seq: z.number().int().positive(),
  status: stepStatusSchema,
  harness: z.string().nullable(),
  handoff: z.string().nullable(),
  summary: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
})

export const workerMessageSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  stepId: z.string().nullable(),
  level: workerMessageLevelSchema,
  message: z.string().min(1),
  createdAt: z.string(),
})

// Types -----------------------------------------------------------------------
export type FlowRun = z.infer<typeof flowRunSchema>
export type FlowStep = z.infer<typeof flowStepSchema>
export type WorkerMessage = z.infer<typeof workerMessageSchema>
export type FlowRunDetail = {
  run: FlowRun
  steps: FlowStep[]
  messages: WorkerMessage[]
}

// API -------------------------------------------------------------------------
export const validateFlowRun = (value: unknown): FlowRun => flowRunSchema.parse(value)
export const validateFlowStep = (value: unknown): FlowStep => flowStepSchema.parse(value)
export const validateWorkerMessage = (value: unknown): WorkerMessage =>
  workerMessageSchema.parse(value)
