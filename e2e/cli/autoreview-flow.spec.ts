import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { useTestHarness } from '../common/fixtures.js'
import { readArtifactText } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
const getHarness = useTestHarness('cli')

// Tests -----------------------------------------------------------------------
describe('Given a running difflab daemon and the user local autoreview flow definition', () => {
  describe('When running difflab flows run autoreview --flag --local with deterministic smoke harness', () => {
    it(
      'should orchestrate local-review and address-local in Herdr, inspect via flows list/status/logs, and export FLOW.md, REVIEW.md, rubric.yaml, logs.txt, and CLI transcript',
      { tags: ['e2e', 'smoke', 'cli', 'autoreview'] },
      async () => {
        // Arrange — introduce a padding defect on a feature branch relative to main
        const { runtime } = getHarness()
        await seedDefectiveTopicBranch(runtime)
        const up = await runtime.cli('daemon', 'up', '--port', '0', '--json')
        expect(up.exitCode).toBe(0)
        const daemon = up.json<{ appUrl: string }>()

        // Act
        const started = await runtime.cli(
          'flows',
          'run',
          'autoreview',
          '--flag',
          '--local',
          '--harness',
          'mock',
          '--json',
        )
        expect(started.exitCode).toBe(0)
        const runId = started.json<{ run: { id: string } }>().run.id

        const completed = await runtime.waitForRun(daemon.appUrl, runId, ['done'])
        const listOut = await runtime.cli('flows', 'list')
        const statusOut = await runtime.cli('flows', 'status', runId)
        const logsOut = await runtime.cli('flows', 'logs', runId)

        const outDir = await runtime.exportArtifacts('autoreview-local-replay', {
          appUrl: daemon.appUrl,
          runId,
        })

        // Assert
        expect(completed.run.status).toBe('done')
        expect(completed.steps.map((s) => s.stepId)).toEqual(['local-review', 'address-local'])
        expect(listOut.stdout).toContain(runId)
        expect(listOut.stdout).toContain('autoreview')
        expect(statusOut.stdout).toContain('[done] 1. local-review')
        expect(statusOut.stdout).toContain('[done] 2. address-local')
        expect(logsOut.stdout).toContain('Step 2 complete: address-local')

        const flowMd = await readArtifactText(outDir, 'FLOW.md')
        const reviewMd = await readArtifactText(outDir, 'REVIEW.md')
        const rubricYaml = await readArtifactText(outDir, 'rubric.yaml')
        const cliLog = await readArtifactText(outDir, 'cli.log')

        expect(flowMd).toContain('997cf99ac2aee67ff75a300a57ebe9e8c66e23b64a4b6277c1c0feb74c3d892c')
        expect(flowMd).toContain('- [x] 1. local-review')
        expect(flowMd).toContain('- [x] 2. address-local')
        expect(reviewMd).toContain('## Change Requests')
        expect(reviewMd).toContain('resolved')
        expect(rubricYaml).toContain('version: 1')
        expect(cliLog).toContain('$ difflab flows run autoreview --flag --local')
      },
    )
  })

  describe('When running difflab flows run autoreview --flag --local with default agy harness', () => {
    it(
      'should launch real agy in Herdr, execute /difflab-flow go autoreview using difflab-review, and export real agy artifacts to e2e/outputs/cli/autoreview-local/',
      { tags: ['e2e', 'extended', 'cli', 'autoreview'] },
      async () => {
        // Arrange — omit --harness so defaultHarness = "agy" runs real agy in Herdr
        const { runtime } = getHarness()
        await seedDefectiveTopicBranch(runtime)
        const up = await runtime.cli('daemon', 'up', '--port', '0', '--json')
        expect(up.exitCode).toBe(0)
        const daemon = up.json<{ appUrl: string }>()

        // Act
        const started = await runtime.cli(
          'flows',
          'run',
          'autoreview',
          '--flag',
          '--local',
          '--json',
        )
        expect(started.exitCode).toBe(0)
        const startedBody = started.json<{ run: { id: string; harness: string } }>()
        expect(startedBody.run.harness).toBe('agy')
        const runId = startedBody.run.id

        const completed = await runtime.waitForRun(daemon.appUrl, runId, ['done'])
        const statusOut = await runtime.cli('flows', 'status', runId)
        const logsOut = await runtime.cli('flows', 'logs', runId)

        const outDir = await runtime.exportArtifacts('autoreview-local', {
          appUrl: daemon.appUrl,
          runId,
        })

        // Assert
        expect(completed.run.status).toBe('done')
        expect(completed.run.harness).toBe('agy')
        expect(completed.steps.map((s) => s.stepId)).toEqual(['local-review', 'address-local'])
        expect(statusOut.stdout).toContain('local-review')
        expect(logsOut.stdout).toContain('local-review')

        const flowMd = await readArtifactText(outDir, 'FLOW.md')
        const reviewMd = await readArtifactText(outDir, 'REVIEW.md')
        const rubricYaml = await readArtifactText(outDir, 'rubric.yaml')

        expect(flowMd).toContain('- **Status:** completed')
        expect(flowMd).toContain('local-review')
        expect(flowMd).toContain('address-local')
        expect(reviewMd).toContain('## Intent Delivery')
        expect(reviewMd).toContain('## Findings')
        expect(reviewMd).not.toContain('Generated via')
        expect(rubricYaml).toContain('version: 1')
      },
    )
  })

  describe('When running difflab flows logs <run-id> --follow', () => {
    it(
      'should stream live worker messages over SSE and exit 0 once the run finishes',
      { tags: ['e2e', 'cli', 'autoreview'] },
      async () => {
        // Arrange
        const { runtime } = getHarness()
        await seedDefectiveTopicBranch(runtime)
        const up = await runtime.cli('daemon', 'up', '--port', '0', '--json')
        expect(up.exitCode).toBe(0)

        const started = await runtime.cli(
          'flows',
          'run',
          'autoreview',
          '--flag',
          '--local',
          '--harness',
          'mock',
          '--json',
        )
        const runId = started.json<{ run: { id: string } }>().run.id

        // Act
        const followed = await runtime.cli('flows', 'logs', runId, '--follow')

        // Assert
        expect(followed.exitCode).toBe(0)
        expect(followed.stdout).toContain('address-local')
      },
    )
  })
})

// Helpers ---------------------------------------------------------------------
async function seedDefectiveTopicBranch(runtime: ReturnType<typeof getHarness>['runtime']) {
  runtime.git(['checkout', '-b', 'feat/topic-padding'])
  await writeFile(
    join(runtime.repoDir, 'src/reviewed-module.ts'),
    [
      '// API -------------------------------------------------------------------------',
      '/** Normalize a topic string by trimming surrounding whitespace (never pad spaces). */',
      'export function formatTopic(topic: string): string {',
      '  return ` ${topic} `',
      '}',
      '',
    ].join('\n'),
    'utf8',
  )
  runtime.git(['add', 'src/reviewed-module.ts'])
  runtime.git(['commit', '-m', 'feat: update formatTopic implementation'])
}
