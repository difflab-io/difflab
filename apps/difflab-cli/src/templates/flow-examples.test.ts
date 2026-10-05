import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendProgressLog } from '../logs/store.js'
import { embeddedSource } from './source.js'

// Types -----------------------------------------------------------------------
type Step = {
  id: string
  when: string
  unless: string
  handler: string
  requires: string
  receives: string
  instructions: string
  produces: string
}

// Tests -----------------------------------------------------------------------
describe('flow example contract fixtures (not an Agent Skill execution)', () => {
  test.each(['autospec', 'autoreview'])('%s selects only the permitted branch', async (name) => {
    // Arrange
    const definition = await readExample(name)
    const local = selectSteps(definition, new Set(['--local']))
    const remote = selectSteps(definition, new Set(['--remote-review']))

    // Act / Assert
    expect(local.length).toBeGreaterThan(0)
    expect(local.every((step) => step.requires !== 'remote-review')).toBe(true)
    expect(local.some((step) => step.handler === 'review new --local')).toBe(true)
    expect(remote.some((step) => step.handler === 'review new')).toBe(true)
    expect(remote.every((step) => step.handler !== 'review new --local')).toBe(true)
    if (name === 'autoreview') {
      expect(remote).toContainEqual(
        expect.objectContaining({
          id: 'address-remote',
          handler: 'review address',
          requires: 'remote-review',
        }),
      )
      expect(remote.every((step) => step.handler !== 'review address --local')).toBe(true)
    }
    expect(() => selectSteps(definition, new Set(['--local', '--remote-review']))).toThrow(
      'contradictory',
    )
    expect(() => selectSteps(definition, new Set(['--surprise']))).toThrow('Unknown flag')
    expect(() => selectSteps(definition, new Set(['--commit', '--local']))).not.toThrow()
    expect(local.some((step) => /merge|push/.test(step.handler))).toBe(false)
    for (const steps of [local, remote]) {
      for (const [index, step] of steps.entries()) {
        for (const match of step.receives.matchAll(/\{\{steps\.([\w-]+)\.([\w-]+)\}\}/g)) {
          expect(
            steps
              .slice(0, index)
              .some((previous) => previous.id === match[1] && previous.produces === match[2]),
          ).toBe(true)
        }
      }
    }
  })

  test.each(['autospec', 'autoreview'])(
    '%s freezes only the chosen branch and resumes unchecked work',
    async (name) => {
      // Arrange: simulate the Agent Skill's markdown checkpoint, without running handlers.
      const directory = await realpath(await mkdtemp(join(tmpdir(), 'flow-scenario-')))
      try {
        const definition = await readExample(name)
        const selected = selectSteps(definition, new Set(['--local', '--commit']))
        const asset = await embeddedSource.read('flow-instance.md')
        const file = join(directory, 'FLOW.md')
        const checklist = selected
          .map(
            (step, index) =>
              `- [ ] ${index + 1}. ${step.id} — ${step.handler}\n  - Requires: ${step.requires}\n  - Instructions: ${step.instructions}\n  - Receives: ${step.receives.replaceAll('{{input}}', 'Example change').replaceAll(/\{\{steps\.([\w-]+)\.([\w-]+)\}\}/g, 'pending handoff $1.$2')}\n  - Expected output: ${step.produces}\n  - Result/handoff: pending`,
          )
          .join('\n')
        const snapshot = asset
          .replace(/## Steps\n\n[\s\S]*?\n## Blocker/, `## Steps\n\n${checklist}\n\n## Blocker`)
          .replace('{{name}}', name)
          .replace('{{absolute-definition-path}}', join(directory, 'definition.md'))
          .replace('{{definition-sha256}}', 'fixture-sha256')
          .replace('{{absolute-repository-root}}', directory)
          .replace('{{run-id}}', `261005-${name}`)
          .replace('{{input}}', 'Example change')
          .replace(
            '{{flags-and-capabilities}}',
            '--local and --commit; local only, no commit-capable step',
          )
          .replace(
            '{{omitted-step-ids-and-reasons-only-no-instructions}}',
            'Remote branch omitted by --local.',
          )
        await writeFile(file, snapshot)
        await appendProgressLog(join(directory, 'logs.txt'), 'Step 1 started: first')

        // Act: a changed definition and a failed append must not advance the frozen run.
        const editedDefinition = definition.replace('## Intent', '## Revised intent')
        await writeFile(join(directory, 'definition.md'), editedDefinition)
        await expect(
          appendProgressLog(join(directory, 'missing/logs.txt'), 'Step 1 complete: first'),
        ).rejects.toThrow()
        const resumed = await readFile(file, 'utf8')

        // Assert
        expect(resumed).toBe(snapshot)
        expect(resumed).toContain(`- [ ] 1. ${selected[0].id}`)
        const checkpoint = resumed
          .replace(`- [ ] 1. ${selected[0].id}`, `- [x] 1. ${selected[0].id}`)
          .replace(
            '  - Result/handoff: pending',
            `  - Result/handoff: ${selected[0].produces}=/verified/artifact`,
          )
        await writeFile(file, checkpoint)
        const resumedAfterCheckpoint = await readFile(file, 'utf8')
        expect(resumedAfterCheckpoint).toContain(`- [x] 1. ${selected[0].id}`)
        expect(resumedAfterCheckpoint).toContain(`- [ ] 2. ${selected[1].id}`)
        expect(resumedAfterCheckpoint).toContain(`${selected[0].produces}=/verified/artifact`)
        expect(resumed).not.toContain('remote-review — review new')
        expect(resumed).not.toContain(' — review new\n')
        expect(resumed).not.toContain('remote review with explicit forge permission')
        expect(resumed).not.toContain('{{steps.')
        expect(resumed).not.toContain('merge —')
        expect(selected.some((step) => step.requires === 'local-commit')).toBe(false)
        expect(
          (await readFile(join(directory, 'logs.txt'), 'utf8')).match(/Step 1 started/g),
        ).toHaveLength(1)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  test('rejects unresolved handoffs, invalid names and unknown flags in fixtures', async () => {
    // Arrange
    const definition = await readExample('autospec')

    // Act / Assert
    expect(() =>
      selectSteps(definition.replace('draft-plan.plan_path', 'missing.plan_path'), new Set()),
    ).toThrow('Unresolved handoff')
    expect(() =>
      selectSteps(
        definition.replace('Receives: `{{input}}`', 'Receives: `{{unknown-input}}`'),
        new Set(),
      ),
    ).toThrow('Unresolved input')
    expect(() =>
      selectSteps(definition.replace('### 1. draft-plan', '### 1. ../escape'), new Set()),
    ).toThrow('Invalid step')
    expect(() =>
      selectSteps(definition.replace('Produces: `plan_path`', 'Produces: `plan/path`'), new Set()),
    ).toThrow('Invalid output')
    expect(() =>
      selectSteps(
        definition.replace('Unless: `--local`', 'Unless: `--unknown`'),
        new Set(['--remote-review']),
      ),
    ).toThrow('Unknown condition')
  })
})

// Helpers ---------------------------------------------------------------------
async function readExample(name: string): Promise<string> {
  return readFile(
    join(import.meta.dir, '..', '..', '..', '..', 'skills/difflab-flow/examples', `${name}.md`),
    'utf8',
  )
}

function selectSteps(definition: string, flags: Set<string>): Step[] {
  const declared = new Set(
    [...definition.matchAll(/^\| (--[a-z][a-z-]*)\s*\|/gm)].map((match) => match[1]),
  )
  for (const flag of flags) if (!declared.has(flag)) throw new Error(`Unknown flag: ${flag}`)
  if (flags.has('--local') && flags.has('--remote-review')) throw new Error('contradictory flags')
  const sections = [
    ...definition.matchAll(/^### (\d+)\. ([^\n]+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm),
  ]
  const steps = sections.map(([, , id, body]) => {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Invalid step')
    const value = (key: string) => {
      const match = body.match(new RegExp(`^- ${key}: (.+)$`, 'm'))
      if (!match) throw new Error(`Missing ${key}`)
      return match[1].replace(/^`|`$/g, '')
    }
    return {
      id,
      when: value('When'),
      unless: value('Unless'),
      handler: value('Handler'),
      requires: value('Requires'),
      receives: value('Receives'),
      produces: value('Produces'),
      instructions: value('Instructions'),
    }
  })
  for (const step of steps) {
    if (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(step.produces)) throw new Error('Invalid output')
    for (const condition of [step.when, step.unless]) {
      if (condition !== 'always' && condition !== 'never' && !declared.has(condition))
        throw new Error('Unknown condition')
    }
  }
  const enabled = (condition: string) =>
    condition === 'always' || (condition !== 'never' && flags.has(condition))
  const selected = steps.filter((step) => enabled(step.when) && !enabled(step.unless))
  const inputs = new Set(
    [...definition.matchAll(/^\| ([a-z][a-z0-9-]*)\s*\| (?:yes|no)\s*\|/gm)].map(
      (match) => match[1],
    ),
  )
  for (const step of selected)
    for (const match of step.receives.matchAll(/\{\{(?!steps\.)([^{}]+)\}\}/g)) {
      if (!inputs.has(match[1])) throw new Error('Unresolved input')
    }
  for (const [index, step] of selected.entries()) {
    for (const match of step.receives.matchAll(/\{\{steps\.([\w-]+)\.([\w-]+)\}\}/g)) {
      if (
        !selected
          .slice(0, index)
          .some((producer) => producer.id === match[1] && producer.produces === match[2])
      )
        throw new Error('Unresolved handoff')
    }
  }
  return selected
}
