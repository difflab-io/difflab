import type { RunStatus, StepStatus } from 'difflab-db'

// Constants -------------------------------------------------------------------
const STATUS_LINE_REGEX = /^-\s+\*\*Status:\*\*\s*(.+)$/im
const STEP_HEADER_REGEX = /^-\s+\[([ xX])\]\s+(\d+)\.\s+([a-z0-9-]+)(?:\s+[—-]\s+(.+))?$/
const HANDOFF_LINE_REGEX = /^\s+-\s+Result\/handoff:\s*(.+)$/i

// Types -----------------------------------------------------------------------
export type FrozenFlowStepState = {
  seq: number
  stepId: string
  status: StepStatus
  handoff: string | null
}

export type FrozenFlowInstanceState = {
  runStatus: RunStatus
  blocker: string | null
  steps: FrozenFlowStepState[]
}

// API -------------------------------------------------------------------------
export function parseFrozenFlowInstance(
  markdown: string,
  activeStepId?: string | null,
): FrozenFlowInstanceState {
  const rawStatus = STATUS_LINE_REGEX.exec(markdown)?.[1]?.trim().toLowerCase() ?? 'in progress'
  const runStatus: RunStatus =
    rawStatus === 'completed' || rawStatus === 'done'
      ? 'done'
      : rawStatus === 'blocked'
        ? 'blocked'
        : rawStatus === 'failed'
          ? 'failed'
          : 'running'

  const blocker = extractBlocker(markdown)
  const steps = extractSteps(markdown, runStatus, activeStepId ?? null)

  return {
    runStatus,
    blocker,
    steps,
  }
}

// Helpers ---------------------------------------------------------------------
function extractBlocker(markdown: string): string | null {
  const match = /^##\s+Blocker\s*$/m.exec(markdown)
  if (!match) return null
  const text = markdown
    .slice(match.index + match[0].length)
    .split(/^##\s+/m)[0]
    ?.trim()
  if (!text || /^none\.?$/i.test(text)) return null
  return text
}

function extractSteps(
  markdown: string,
  runStatus: RunStatus,
  activeStepId: string | null,
): FrozenFlowStepState[] {
  const stepsMatch = /^##\s+Steps\s*$/m.exec(markdown)
  if (!stepsMatch) return []

  const afterSteps = markdown.slice(stepsMatch.index + stepsMatch[0].length)
  const nextSectionIdx = afterSteps.search(/^##\s+/m)
  const stepsSection = nextSectionIdx === -1 ? afterSteps : afterSteps.slice(0, nextSectionIdx)

  const lines = stepsSection.split(/\r?\n/)
  const parsed: FrozenFlowStepState[] = []
  let current: FrozenFlowStepState | null = null

  for (const line of lines) {
    const header = STEP_HEADER_REGEX.exec(line)
    if (header) {
      if (current) parsed.push(current)
      const checked = header[1]?.toLowerCase() === 'x'
      const seq = Number(header[2])
      const stepId = header[3]!
      current = {
        seq,
        stepId,
        status: checked ? 'done' : activeStepId === stepId ? 'running' : 'pending',
        handoff: null,
      }
      continue
    }

    if (current) {
      const handoffMatch = HANDOFF_LINE_REGEX.exec(line)
      if (handoffMatch) {
        const value = handoffMatch[1]?.trim() ?? ''
        current.handoff = !value || /^pending$/i.test(value) ? null : value
      }
    }
  }
  if (current) parsed.push(current)

  if (runStatus === 'blocked' || runStatus === 'failed') {
    const firstIncomplete = parsed.find((s) => s.status !== 'done')
    if (firstIncomplete) {
      firstIncomplete.status = 'failed'
    }
  }

  return parsed
}
