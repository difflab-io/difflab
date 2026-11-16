import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Constants -------------------------------------------------------------------
const SAFE_FLOW_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

// Types -----------------------------------------------------------------------
export type FlowInputSpec = {
  name: string
  required: boolean
  defaultValue: string | null
  description: string
}

export type FlowFlagSpec = {
  flag: string
  defaultEnabled: boolean
  capability: string
  effect: string
}

export type FlowStepSpec = {
  number: number
  stepId: string
  handler: string
  when: string
  unless: string
  requires: string
  receives: string
  produces: string
  instructions: string
  harness?: string
}

export type ParsedFlowDefinition = {
  name: string
  definitionPath: string
  sha256: string
  intent: string
  inputs: FlowInputSpec[]
  flags: FlowFlagSpec[]
  steps: FlowStepSpec[]
}

export type ResolvedFlowStep = {
  seq: number
  stepId: string
  handler: string
  requires: string
  receivesTemplate: string
  produces: string
  instructionsTemplate: string
  harness?: string
}

export type ResolvedFlowPlan = {
  definition: ParsedFlowDefinition
  resolvedInputs: Record<string, string>
  enabledFlags: string[]
  disabledFlags: string[]
  omittedSteps: { stepId: string; reason: string }[]
  selectedSteps: ResolvedFlowStep[]
}

export class FlowDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlowDefinitionError'
  }
}

// API -------------------------------------------------------------------------
export async function loadFlowDefinition(
  flowsDir: string,
  flowName: string,
): Promise<ParsedFlowDefinition> {
  if (!SAFE_FLOW_NAME.test(flowName)) {
    throw new FlowDefinitionError(`Invalid flow name: ${flowName}`)
  }
  const definitionPath = join(flowsDir, `${flowName}.md`)
  let raw: string
  try {
    raw = await readFile(definitionPath, 'utf8')
  } catch (error) {
    throw new FlowDefinitionError(
      `Could not read flow definition ${definitionPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return parseFlowDefinitionMarkdown(flowName, definitionPath, raw)
}

export function parseFlowDefinitionMarkdown(
  flowName: string,
  definitionPath: string,
  markdown: string,
): ParsedFlowDefinition {
  const sha256 = createHash('sha256').update(markdown, 'utf8').digest('hex')
  const intent = extractSection(markdown, 'Intent').trim()
  const inputs = parseInputsTable(extractSection(markdown, 'Inputs'))
  const flags = parseFlagsTable(extractSection(markdown, 'Flags'))
  const steps = parseStepsSection(extractSection(markdown, 'Steps'))
  if (!steps.length) {
    throw new FlowDefinitionError(`Flow definition ${flowName} declares no steps`)
  }
  return {
    name: flowName,
    definitionPath,
    sha256,
    intent,
    inputs,
    flags,
    steps,
  }
}

export function resolveFlowExecutionPlan(
  definition: ParsedFlowDefinition,
  rawInputs: Record<string, string> = {},
  rawFlags: string[] = [],
): ResolvedFlowPlan {
  const declaredFlagSet = new Set(definition.flags.map((f) => f.flag))
  for (const passed of rawFlags) {
    if (!declaredFlagSet.has(passed)) {
      throw new FlowDefinitionError(`Unknown flag ${passed} for flow ${definition.name}`)
    }
  }
  if (rawFlags.includes('--local') && rawFlags.includes('--remote-review')) {
    throw new FlowDefinitionError('Flags --local and --remote-review cannot be combined')
  }

  const activeFlags = new Set<string>()
  for (const spec of definition.flags) {
    if (spec.defaultEnabled || rawFlags.includes(spec.flag)) {
      activeFlags.add(spec.flag)
    }
  }

  const resolvedInputs: Record<string, string> = {}
  for (const spec of definition.inputs) {
    const provided = rawInputs[spec.name]
    if (provided !== undefined && provided.trim() !== '') {
      resolvedInputs[spec.name] = provided
    } else if (!spec.required && spec.defaultValue !== null) {
      resolvedInputs[spec.name] = spec.defaultValue
    } else if (spec.required) {
      throw new FlowDefinitionError(
        `Missing required input '${spec.name}' for flow ${definition.name}`,
      )
    }
  }

  const omittedSteps: { stepId: string; reason: string }[] = []
  const selectedSteps: ResolvedFlowStep[] = []

  for (const step of definition.steps) {
    const whenOk =
      step.when === 'always'
        ? true
        : step.when === 'never'
          ? false
          : activeFlags.has(stripTicks(step.when))
    const unlessBlocked =
      step.unless === 'never'
        ? false
        : step.unless === 'always'
          ? true
          : activeFlags.has(stripTicks(step.unless))
    const localOmitted = activeFlags.has('--local') && step.requires !== 'local'

    if (!whenOk) {
      omittedSteps.push({ stepId: step.stepId, reason: `when ${step.when} not active` })
      continue
    }
    if (unlessBlocked) {
      omittedSteps.push({ stepId: step.stepId, reason: `unless ${step.unless} active` })
      continue
    }
    if (localOmitted) {
      omittedSteps.push({ stepId: step.stepId, reason: '--local omits remote step' })
      continue
    }

    selectedSteps.push({
      seq: selectedSteps.length + 1,
      stepId: step.stepId,
      handler: stripTicks(step.handler),
      requires: stripTicks(step.requires),
      receivesTemplate: substituteInputTokens(step.receives, resolvedInputs),
      produces: step.produces,
      instructionsTemplate: substituteInputTokens(step.instructions, resolvedInputs),
      ...(step.harness ? { harness: stripTicks(step.harness) } : {}),
    })
  }

  if (!selectedSteps.length) {
    throw new FlowDefinitionError(`No executable steps selected for flow ${definition.name}`)
  }

  return {
    definition,
    resolvedInputs,
    enabledFlags: [...activeFlags],
    disabledFlags: definition.flags.map((f) => f.flag).filter((f) => !activeFlags.has(f)),
    omittedSteps,
    selectedSteps,
  }
}

export function resolveStepHandoffTokens(
  template: string,
  completedHandoffs: Record<string, string>,
): string {
  return template.replace(
    /\{\{steps\.([a-z0-9-]+)\.([a-z0-9_-]+)\}\}/g,
    (_match, rawStepId, rawField) => {
      const stepId = String(rawStepId)
      const field = String(rawField)
      const rawHandoff = completedHandoffs[stepId]
      if (!rawHandoff) {
        return `<pending: steps.${stepId}.${field}>`
      }
      const pairs = parseHandoffPairs(rawHandoff)
      return pairs[field] ?? rawHandoff
    },
  )
}

// Helpers ---------------------------------------------------------------------
function parseHandoffPairs(handoff: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of handoff.split(';')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx <= 0) continue
    const key = part.slice(0, eqIdx).trim()
    const value = part.slice(eqIdx + 1).trim()
    if (key && value) out[key] = value
  }
  return out
}
function extractSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/)
  const headerLine = `## ${heading}`
  const startIdx = lines.findIndex((line) => line.trim() === headerLine)
  if (startIdx === -1) {
    throw new FlowDefinitionError(`Missing required heading: ## ${heading}`)
  }
  const collected: string[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (/^##\s+/.test(line)) break
    collected.push(line)
  }
  return collected.join('\n')
}

function parseMarkdownTable(section: string): string[][] {
  const rows = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
  if (rows.length < 2) return []
  return rows.slice(2).map((row) =>
    row
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim()),
  )
}

function parseInputsTable(section: string): FlowInputSpec[] {
  return parseMarkdownTable(section).map((cells) => {
    const [name = '', req = 'yes', def = '—', description = ''] = cells
    const required = req.toLowerCase() === 'yes' || req.toLowerCase() === 'true'
    const defaultValue = def === '—' || def === '-' || def === '' ? null : def
    return { name: stripTicks(name), required, defaultValue, description }
  })
}

function parseFlagsTable(section: string): FlowFlagSpec[] {
  return parseMarkdownTable(section).map((cells) => {
    const [flag = '', def = 'false', capability = '', effect = ''] = cells
    return {
      flag: stripTicks(flag),
      defaultEnabled: def.toLowerCase() === 'true',
      capability: stripTicks(capability),
      effect,
    }
  })
}

function parseStepsSection(section: string): FlowStepSpec[] {
  const lines = section.split(/\r?\n/)
  const steps: FlowStepSpec[] = []
  let current: Partial<FlowStepSpec> | null = null

  const pushCurrent = () => {
    if (!current || !current.stepId) return
    steps.push({
      number: current.number ?? steps.length + 1,
      stepId: current.stepId,
      handler: current.handler ?? '',
      when: stripTicks(current.when ?? 'always'),
      unless: stripTicks(current.unless ?? 'never'),
      requires: current.requires ?? 'local',
      receives: current.receives ?? '',
      produces: current.produces ?? '',
      instructions: current.instructions ?? '',
      ...(current.harness ? { harness: current.harness } : {}),
    })
  }

  for (const line of lines) {
    const stepMatch = /^###\s+(\d+)\.\s+([a-z0-9-]+)\s*$/.exec(line.trim())
    if (stepMatch) {
      pushCurrent()
      current = {
        number: Number(stepMatch[1]),
        stepId: stepMatch[2]!,
      }
      continue
    }
    if (!current) continue
    const fieldMatch = /^-\s+([A-Za-z ]+):\s*(.+)$/.exec(line.trim())
    if (!fieldMatch) continue
    const label = fieldMatch[1]!.trim().toLowerCase()
    const value = fieldMatch[2]!.trim()
    if (label === 'handler') current.handler = value
    else if (label === 'when') current.when = value
    else if (label === 'unless') current.unless = value
    else if (label === 'requires') current.requires = value
    else if (label === 'receives') current.receives = value
    else if (label === 'produces') current.produces = value
    else if (label === 'instructions') current.instructions = value
    else if (label === 'harness') current.harness = value
  }
  pushCurrent()
  return steps
}

function stripTicks(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('`') && trimmed.endsWith('`') ? trimmed.slice(1, -1) : trimmed
}

function substituteInputTokens(text: string, inputs: Record<string, string>): string {
  return text.replace(/\{\{([a-z0-9-]+)\}\}/g, (match, key) => {
    return Object.hasOwn(inputs, String(key)) ? inputs[String(key)]! : match
  })
}
