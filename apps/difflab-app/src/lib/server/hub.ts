import type { FlowRun, FlowStep, WorkerMessage } from 'difflab-db'

// Constants -------------------------------------------------------------------
const listeners = new Set<{ listener: Listener; runId?: string }>()

// Types -----------------------------------------------------------------------
export type FlowStreamEvent =
  | { type: 'run.updated'; runId: string; run: FlowRun }
  | { type: 'step.updated'; runId: string; step: FlowStep }
  | { type: 'worker.message'; runId: string; message: WorkerMessage }

type Listener = (event: FlowStreamEvent) => void

// API -------------------------------------------------------------------------
export function publishFlowEvent(event: FlowStreamEvent): void {
  for (const subscriber of listeners) {
    if (!subscriber.runId || subscriber.runId === event.runId) {
      subscriber.listener(event)
    }
  }
}

export function subscribeFlowEvents(listener: Listener, runId?: string): () => void {
  const entry = { listener, runId }
  listeners.add(entry)
  return () => {
    listeners.delete(entry)
  }
}
