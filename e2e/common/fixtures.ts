import { afterEach, beforeEach } from 'vitest'
import { TestHarness } from './test-harness.js'

// API -------------------------------------------------------------------------
/** Owns an isolated Difflab home, fixture repository, daemon, and Herdr session per journey. */
export function useTestHarness(suite: 'app' | 'cli', environment?: () => NodeJS.ProcessEnv) {
  let runtime: TestHarness | undefined

  beforeEach(async ({ task }) => {
    runtime = await TestHarness.create(suite, environment?.(), {
      name: task.name,
    })
  })

  afterEach(async ({ task }) => {
    try {
      await runtime?.dispose(task.result?.state === 'fail')
    } finally {
      runtime = undefined
    }
  })

  return () => {
    if (!runtime) throw new Error('TestHarness requested outside an active test')
    return { runtime }
  }
}
