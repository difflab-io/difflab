// Types -----------------------------------------------------------------------
export interface FlowDagStepNode {
  id: string
  seq: number
  stepId: string
  status: 'pending' | 'running' | 'done' | 'failed'
  harness?: string | null
  summary?: string | null
  handoff?: string | null
}

export interface FlowDagGraphProps {
  steps: FlowDagStepNode[]
  selectedStepId?: string | null
  onSelectStep?: (stepId: string | null) => void
  class?: string
}
