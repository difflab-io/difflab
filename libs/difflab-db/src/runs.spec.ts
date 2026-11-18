import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDifflabDb, DuplicateTriggerError, type DifflabDb, type Repository } from './index.js'

// Setup -----------------------------------------------------------------------
let root: string
let dbPath: string
const stores: DifflabDb[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'difflab-runs-spec-'))
  dbPath = join(root, 'difflab.sqlite')
})

// Tests -----------------------------------------------------------------------
describe('given an initialized 002_loops_mvp database', () => {
  test('when inserting two runs with the same trigger_key concurrently, then exactly one succeeds and the duplicate rejects', async () => {
    // Arrange
    const { store, repo } = await seedRepository('/tmp/example-repo')
    const second = await open()

    // Act
    const outcomes = await Promise.allSettled([
      store.runs.createRun({
        id: '261116-autospec-a',
        repoId: repo.id,
        flowName: 'autospec',
        triggerKey: 'linear:ENG-42:ready:autospec',
        harness: 'agy',
        storeFlowDir: '/tmp/store/flows/261116-autospec-a',
        steps: [],
      }),
      second.runs.createRun({
        id: '261116-autospec-b',
        repoId: repo.id,
        flowName: 'autospec',
        triggerKey: 'linear:ENG-42:ready:autospec',
        harness: 'agy',
        storeFlowDir: '/tmp/store/flows/261116-autospec-b',
        steps: [],
      }),
    ])

    // Assert
    const fulfilled = outcomes.filter((item) => item.status === 'fulfilled')
    const rejected = outcomes.filter(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    )
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toBeInstanceOf(DuplicateTriggerError)
    expect(await store.runs.listRuns()).toHaveLength(1)
  })

  test('when saving runs, step handoffs, and worker_messages, then ordered state persists without file blobs', async () => {
    // Arrange
    const { store, repo } = await seedRepository('/tmp/example-repo')
    await store.runs.createRun({
      id: '261116-autoreview-1',
      repoId: repo.id,
      flowName: 'autoreview',
      harness: 'claude',
      storeFlowDir: '/tmp/store/flows/261116-autoreview-1',
      steps: [
        { stepId: 'local-review', seq: 1, harness: 'claude' },
        { stepId: 'address-local', seq: 2, harness: 'codex' },
      ],
      initialMessage: 'Run queued',
    })

    // Act
    await store.runs.updateRunState('261116-autoreview-1', {
      status: 'running',
      worktreePath: '/tmp/worktrees/261116-autoreview-1',
      herdrSession: 'e2e-session',
      herdrPaneId: 'w1:p1',
      herdrAgentName: 'run-261116',
      step: {
        stepId: 'local-review',
        status: 'done',
        handoff: '/tmp/store/reviews/261116-demo/REVIEW.md',
        summary: 'Zero blocking findings',
      },
      message: {
        stepId: 'local-review',
        level: 'done',
        text: 'Step 1 complete: local-review',
      },
    })
    const detail = await store.runs.getRun('261116-autoreview-1')

    // Assert
    expect(repo.localPath).toBe('/tmp/example-repo')
    expect(detail.run.status).toBe('running')
    expect(detail.run.herdrPaneId).toBe('w1:p1')
    expect(
      detail.steps.map((s) => ({ id: s.stepId, status: s.status, handoff: s.handoff })),
    ).toEqual([
      {
        id: 'local-review',
        status: 'done',
        handoff: '/tmp/store/reviews/261116-demo/REVIEW.md',
      },
      {
        id: 'address-local',
        status: 'pending',
        handoff: null,
      },
    ])
    expect(detail.messages.map((m) => m.message)).toEqual([
      'Run queued',
      'Step 1 complete: local-review',
    ])
  })

  test('when a run starts with empty steps and syncs frozen FLOW.md steps dynamically, then steps upsert in sequence order', async () => {
    // Arrange
    const { store, repo } = await seedRepository('/tmp/example-repo')
    await store.runs.createRun({
      id: '261116-autospec-dynamic',
      repoId: repo.id,
      flowName: 'autospec',
      harness: 'agy',
      storeFlowDir: '/tmp/store/flows/261116-autospec-dynamic',
      steps: [],
    })

    // Act
    await store.runs.updateRunState('261116-autospec-dynamic', {
      status: 'running',
      steps: [
        {
          seq: 1,
          stepId: 'create-plan',
          status: 'done',
          handoff: '/tmp/store/plans/261116-demo/PLAN.md',
        },
        {
          seq: 2,
          stepId: 'execute-plan',
          status: 'running',
        },
        {
          seq: 3,
          stepId: 'local-review',
          status: 'pending',
        },
      ],
    })
    const detail = await store.runs.getRun('261116-autospec-dynamic')

    // Assert
    expect(
      detail.steps.map((s) => ({
        seq: s.seq,
        stepId: s.stepId,
        status: s.status,
        handoff: s.handoff,
      })),
    ).toEqual([
      {
        seq: 1,
        stepId: 'create-plan',
        status: 'done',
        handoff: '/tmp/store/plans/261116-demo/PLAN.md',
      },
      {
        seq: 2,
        stepId: 'execute-plan',
        status: 'running',
        handoff: null,
      },
      {
        seq: 3,
        stepId: 'local-review',
        status: 'pending',
        handoff: null,
      },
    ])
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()))
  await rm(root, { recursive: true, force: true })
})

// Helpers ---------------------------------------------------------------------
async function open(): Promise<DifflabDb> {
  const store = await createDifflabDb(dbPath)
  stores.push(store)
  return store
}

async function seedRepository(localPath: string): Promise<{ store: DifflabDb; repo: Repository }> {
  const store = await open()
  await store.projects.createProject('DFL', 'Difflab')
  const repo = await store.repositories.linkRepositoryToProject(
    'DFL',
    'https://github.com/difflab-io/difflab',
    localPath,
  )
  return { store, repo }
}
