import { describe, expect, it } from 'vitest'
import type { FlowRun } from 'difflab-db'
import { publishFlowEvent, subscribeFlowEvents, type FlowStreamEvent } from './server/hub.js'

// Tests -----------------------------------------------------------------------
describe('Given subscribed SSE flow stream listeners', () => {
  it('when publishing run and step events, then global listeners receive all runs while scoped listeners receive only matching runId', () => {
    // Arrange
    const allEvents: FlowStreamEvent[] = []
    const scopedEvents: FlowStreamEvent[] = []
    const unsubAll = subscribeFlowEvents((event) => allEvents.push(event))
    const unsubScoped = subscribeFlowEvents((event) => scopedEvents.push(event), 'run-a')
    const sampleRun = makeSampleRun('run-a')
    const otherRun = makeSampleRun('run-b')

    try {
      // Act
      publishFlowEvent({ type: 'run.updated', runId: 'run-a', run: sampleRun })
      publishFlowEvent({ type: 'run.updated', runId: 'run-b', run: otherRun })

      // Assert
      expect(allEvents.map((e) => e.runId)).toEqual(['run-a', 'run-b'])
      expect(scopedEvents.map((e) => e.runId)).toEqual(['run-a'])
    } finally {
      unsubAll()
      unsubScoped()
    }
  })
})

// Helpers ---------------------------------------------------------------------
function makeSampleRun(id: string): FlowRun {
  return {
    id,
    repoId: 'repo-1',
    flowName: 'autospec',
    triggerKey: null,
    status: 'running',
    harness: 'agy',
    worktreePath: '/tmp/wt',
    storeFlowDir: `/tmp/flows/${id}`,
    herdrSession: 'e2e',
    herdrPaneId: 'w1:p1',
    herdrAgentName: 'dl-agent',
    commitSha: null,
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
  }
}
