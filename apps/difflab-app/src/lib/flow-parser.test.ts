import { describe, expect, it } from 'bun:test'
import {
  FlowDefinitionError,
  parseFlowDefinitionMarkdown,
  resolveFlowExecutionPlan,
  resolveStepHandoffTokens,
} from './server/flow-parser.js'

// Setup -----------------------------------------------------------------------
const AUTOSPEC_FIXTURE = `# autospec

## Intent

Autonomously plan, implement, review, and publish a feature PR.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| input | yes | — | Objective to plan and implement. |
| branch | no | auto | Branch name or auto. |

## Flags

| Flag | Default | Capability | Effect |
| --- | --- | --- | --- |
| --merge | false | merge | Include final merge after checks pass. |

## Steps

### 1. prepare-branch

- Handler: \`procedure: prepare feature checkout\`
- When: always
- Unless: never
- Requires: local
- Receives: \`{{input}}\`, \`{{branch}}\`
- Produces: \`checkout\`
- Instructions: Prepare checkout for {{input}}.

### 2. draft-plan

- Handler: \`plan new\`
- When: always
- Unless: never
- Requires: local
- Receives: \`{{input}}\`, \`{{steps.prepare-branch.checkout}}\`
- Produces: \`plan_path\`
- Instructions: Draft plan in checkout.

### 3. merge

- Handler: \`pr merge\`
- When: \`--merge\`
- Unless: never
- Requires: merge
- Receives: \`{{steps.draft-plan.plan_path}}\`
- Produces: \`merge_result\`
- Instructions: Merge verified PR.
`

const AUTOREVIEW_FIXTURE = `# autoreview

## Intent

Run one review and address round.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| input | no | current branch diff | Target diff. |

## Flags

| Flag | Default | Capability | Effect |
| --- | --- | --- | --- |
| --local | false | local | Select local review and address. |
| --remote-review | false | remote-review | Select remote review and address. |

## Steps

### 1. local-review

- Handler: \`review new --local\`
- When: always
- Unless: \`--remote-review\`
- Requires: local
- Receives: \`{{input}}\`
- Produces: \`review_path\`
- Instructions: Review locally.

### 2. remote-review

- Handler: \`review new\`
- When: \`--remote-review\`
- Unless: \`--local\`
- Requires: remote-review
- Receives: \`{{input}}\`
- Produces: \`review_path\`, \`pr_url\`
- Instructions: Review remotely.

### 3. address-local

- Handler: \`review address --local\`
- When: always
- Unless: \`--remote-review\`
- Requires: local
- Receives: \`{{steps.local-review.review_path}}\`
- Produces: \`result\`
- Instructions: Address local findings.
`

// Tests -----------------------------------------------------------------------
describe('flow-parser', () => {
  describe('given an autospec flow definition', () => {
    it('omits --merge steps by default and resolves input defaults', () => {
      // Arrange
      const parsed = parseFlowDefinitionMarkdown(
        'autospec',
        '/tmp/flows/autospec.md',
        AUTOSPEC_FIXTURE,
      )

      // Act
      const plan = resolveFlowExecutionPlan(parsed, { input: 'ENG-42: Add loops' }, [])

      // Assert
      expect(plan.resolvedInputs).toEqual({
        input: 'ENG-42: Add loops',
        branch: 'auto',
      })
      expect(plan.selectedSteps.map((s) => s.stepId)).toEqual(['prepare-branch', 'draft-plan'])
      expect(plan.omittedSteps).toEqual([{ stepId: 'merge', reason: 'when --merge not active' }])
    })

    it('includes merge when --merge is passed and rejects missing required input', () => {
      // Arrange
      const parsed = parseFlowDefinitionMarkdown(
        'autospec',
        '/tmp/flows/autospec.md',
        AUTOSPEC_FIXTURE,
      )

      // Act
      const withMerge = resolveFlowExecutionPlan(parsed, { input: 'ENG-42' }, ['--merge'])

      // Assert
      expect(withMerge.selectedSteps.map((s) => s.stepId)).toEqual([
        'prepare-branch',
        'draft-plan',
        'merge',
      ])
      expect(() => resolveFlowExecutionPlan(parsed, {}, [])).toThrow(FlowDefinitionError)
    })
  })

  describe('given an autoreview flow definition and step handoffs', () => {
    it('selects local steps on --local, rejects conflicting flags, and substitutes multi-field handoffs', () => {
      // Arrange
      const parsed = parseFlowDefinitionMarkdown(
        'autoreview',
        '/tmp/flows/autoreview.md',
        AUTOREVIEW_FIXTURE,
      )

      // Act
      const localPlan = resolveFlowExecutionPlan(parsed, {}, ['--local'])
      const resolved = resolveStepHandoffTokens(
        '`{{steps.remote-review.review_path}}`, `{{steps.remote-review.pr_url}}`',
        {
          'remote-review': 'review_path=/tmp/REVIEW.md; pr_url=https://github.com/org/repo/pull/7',
        },
      )

      // Assert
      expect(localPlan.selectedSteps.map((s) => s.stepId)).toEqual([
        'local-review',
        'address-local',
      ])
      expect(resolved).toBe('`/tmp/REVIEW.md`, `https://github.com/org/repo/pull/7`')
      expect(() => resolveFlowExecutionPlan(parsed, {}, ['--local', '--remote-review'])).toThrow(
        FlowDefinitionError,
      )
    })
  })
})
