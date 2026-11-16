import { describe, expect, it } from 'vitest'
import { useTestHarness } from '../common/fixtures.js'
import { readArtifactText } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
const getHarness = useTestHarness('cli')

// Tests -----------------------------------------------------------------------
describe('Given a running difflab daemon and local autoreview flow definition', () => {
  describe('When running difflab flows run autoreview --flag --local', () => {
    it(
      'should orchestrate local-review and address-local in Herdr, inspect via flows list/status/logs, and export FLOW.md, REVIEW.md, logs.txt, and CLI transcript to e2e/outputs/',
      { tags: ['e2e', 'smoke', 'cli', 'autoreview'] },
      async () => {
        // Arrange
        const { runtime } = getHarness()
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

        const outDir = await runtime.exportArtifacts('autoreview-local', {
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
        const cliLog = await readArtifactText(outDir, 'cli.log')

        expect(flowMd).toContain('- [x] 1. local-review')
        expect(flowMd).toContain('- [x] 2. address-local')
        expect(reviewMd).toContain('Fixed whitespace normalization')
        expect(cliLog).toContain('$ difflab flows run autoreview --flag --local')
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
