import { describe, expect, test } from 'bun:test'
import { parseFrozenFlowInstance } from './flow-markdown.js'

// Tests -----------------------------------------------------------------------
describe('given a frozen FLOW.md instance scaffolded by difflab-flow', () => {
  test('when steps complete and the next step starts, then parseFrozenFlowInstance extracts ordered statuses and handoffs', () => {
    // Arrange
    const markdown = [
      '# Flow run: autoreview',
      '',
      '- **Status:** in progress',
      '- **Definition:** /Users/dev/.difflab/flows/autoreview.md',
      '- **Definition SHA-256:** abc123',
      '- **Repository:** /tmp/repo',
      '- **Run ID:** 261116-autoreview-a1b2',
      '',
      '## Steps',
      '',
      '- [x] 1. local-review — `review new --local`',
      '  - Requires: local',
      '  - Instructions: Review the diff.',
      '  - Receives: current branch diff',
      '  - Expected output: review_path',
      '  - Result/handoff: /tmp/store/reviews/261116-fix/REVIEW.md',
      '',
      '- [ ] 2. address-local — `review address --local`',
      '  - Requires: local',
      '  - Instructions: Address requests.',
      '  - Receives: /tmp/store/reviews/261116-fix/REVIEW.md',
      '  - Expected output: result',
      '  - Result/handoff: pending',
      '',
      '## Blocker',
      '',
      'None.',
      '',
      '## Contract',
      '',
      'Frozen snapshot.',
    ].join('\n')

    // Act
    const state = parseFrozenFlowInstance(markdown, 'address-local')

    // Assert
    expect(state).toEqual({
      runStatus: 'running',
      blocker: null,
      steps: [
        {
          seq: 1,
          stepId: 'local-review',
          status: 'done',
          handoff: '/tmp/store/reviews/261116-fix/REVIEW.md',
        },
        {
          seq: 2,
          stepId: 'address-local',
          status: 'running',
          handoff: null,
        },
      ],
    })
  })

  test('when FLOW.md records a blocker, then the first incomplete step is marked failed and blocker text is returned', () => {
    // Arrange
    const markdown = [
      '# Flow run: autospec',
      '',
      '- **Status:** blocked',
      '',
      '## Steps',
      '',
      '- [x] 1. prepare-branch — `procedure: prepare feature checkout`',
      '  - Result/handoff: /tmp/wt (feature/demo)',
      '',
      '- [ ] 2. draft-plan — `plan new`',
      '  - Result/handoff: pending',
      '',
      '## Blocker',
      '',
      'Missing required Linear objective details.',
      '',
      '## Contract',
      '',
      'Frozen snapshot.',
    ].join('\n')

    // Act
    const state = parseFrozenFlowInstance(markdown)

    // Assert
    expect(state.runStatus).toBe('blocked')
    expect(state.blocker).toBe('Missing required Linear objective details.')
    expect(state.steps).toEqual([
      {
        seq: 1,
        stepId: 'prepare-branch',
        status: 'done',
        handoff: '/tmp/wt (feature/demo)',
      },
      {
        seq: 2,
        stepId: 'draft-plan',
        status: 'failed',
        handoff: null,
      },
    ])
  })
})
