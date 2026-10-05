// Bun bundles these text imports; TypeScript cannot resolve markdown modules.

import specDrivenPlan from '../../templates/spec-driven-plan.md' with { type: 'text' }

import softwareArchitectureDesign from '../../templates/software-architecture-design.md' with { type: 'text' }

import architectureDecisionRecord from '../../templates/architecture-decision-record.md' with { type: 'text' }

import productRequirementsDocument from '../../templates/product-requirements-document.md' with { type: 'text' }

import codeReview from '../../templates/code-review.md' with { type: 'text' }

import planningIntent from '../../templates/planning-intent.md' with { type: 'text' }

import uiComponentArchitecture from '../../templates/ui-component-architecture.md' with { type: 'text' }

import pullRequestDescription from '../../templates/pull-request-description.md' with { type: 'text' }

import flowDefinition from '../../templates/flow-definition.md' with { type: 'text' }

import flowInstance from '../../templates/flow-instance.md' with { type: 'text' }

import planFeature from '../../templates/examples/plan-feature.md' with { type: 'text' }

import planMigration from '../../templates/examples/plan-migration.md' with { type: 'text' }

import designService from '../../templates/examples/design-service.md' with { type: 'text' }

import adrStorage from '../../templates/examples/adr-storage.md' with { type: 'text' }

import prdOnboarding from '../../templates/examples/prd-onboarding.md' with { type: 'text' }

import reviewChange from '../../templates/examples/review-change.md' with { type: 'text' }

import intentRequest from '../../templates/examples/intent-request.md' with { type: 'text' }

import componentDialog from '../../templates/examples/component-dialog.md' with { type: 'text' }

import componentNavigation from '../../templates/examples/component-navigation.md' with { type: 'text' }

import pullRequestFeature from '../../templates/examples/pull-request-feature.md' with { type: 'text' }

export type TemplateInfo = {
  name: string
  description: string
}

export const catalog: TemplateInfo[] = [
  { name: 'spec-driven-plan', description: 'Spec-driven implementation plan' },
  { name: 'software-architecture-design', description: 'Software architecture design' },
  { name: 'architecture-decision-record', description: 'Architecture decision record' },
  { name: 'product-requirements-document', description: 'Product requirements document' },
  { name: 'code-review', description: 'Thorough code review' },
  { name: 'planning-intent', description: 'Planning intent for a user to fill in' },
  { name: 'ui-component-architecture', description: 'UI component design and implementation' },
  { name: 'pull-request-description', description: 'Draft pull request description' },
  { name: 'flow-definition', description: 'Reusable global Agent Skill flow definition' },
  { name: 'flow-instance', description: 'Frozen repository-local flow run' },
]

const contents: Record<string, string> = {
  'spec-driven-plan.md': specDrivenPlan,
  'software-architecture-design.md': softwareArchitectureDesign,
  'architecture-decision-record.md': architectureDecisionRecord,
  'product-requirements-document.md': productRequirementsDocument,
  'code-review.md': codeReview,
  'planning-intent.md': planningIntent,
  'ui-component-architecture.md': uiComponentArchitecture,
  'pull-request-description.md': pullRequestDescription,
  'flow-definition.md': flowDefinition,
  'flow-instance.md': flowInstance,
  'examples/plan-feature.md': planFeature,
  'examples/plan-migration.md': planMigration,
  'examples/design-service.md': designService,
  'examples/adr-storage.md': adrStorage,
  'examples/prd-onboarding.md': prdOnboarding,
  'examples/review-change.md': reviewChange,
  'examples/intent-request.md': intentRequest,
  'examples/component-dialog.md': componentDialog,
  'examples/component-navigation.md': componentNavigation,
  'examples/pull-request-feature.md': pullRequestFeature,
}

export type TemplateSource = {
  catalog: readonly TemplateInfo[]
  assets: readonly string[]
  read(asset: string): Promise<string>
}

export const embeddedSource: TemplateSource = {
  catalog,
  assets: Object.keys(contents),
  async read(asset) {
    const content = contents[asset]
    if (content === undefined) throw new Error(`Missing embedded template asset: ${asset}`)
    return content
  },
}
