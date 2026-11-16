import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { startCassetteServer } from '../common/cassette.js'
import { useTestHarness } from '../common/fixtures.js'
import { readArtifactText, WORKSPACE_ROOT } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
const CASSETTE_PATH = join(WORKSPACE_ROOT, 'e2e/recordings/app/linear-ready-autospec.json')
const getHarness = useTestHarness('app')

// Tests -----------------------------------------------------------------------
describe('Given a Linear cassette with Ready tasks and a repo configured for autospec', () => {
  describe('When Ready issues lack the required agent or tag criteria', () => {
    it(
      'should ignore non-matching Ready tasks without creating a workflow run',
      { tags: ['e2e', 'app', 'linear'] },
      async () => {
        // Arrange
        const { runtime } = getHarness()
        await runtime.writeRepoConfig(
          [
            'schemaVersion: 1',
            'project:',
            '  id: DIFFLAB',
            'flows:',
            '  defaultHarness: mock',
            '  retention: retain',
            '  triggers:',
            '    - on: linear.issue.ready',
            '      team: ENG',
            '      agent: other-bot',
            '      labels:',
            '        - COMP:other',
            '      flow: autospec',
            '',
          ].join('\n'),
        )
        const cassette = await startCassetteServer(CASSETTE_PATH)

        try {
          const up = await runtime.cli('daemon', 'up', '--port', '0', '--json')
          expect(up.exitCode).toBe(0)
          const daemon = up.json<{ appUrl: string; engineUrl: string }>()

          // Act
          const pollRes = await fetch(`${daemon.engineUrl}/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              linearApiUrl: `${cassette.url}/graphql`,
              linearApiKey: 'lin_cassette_token',
              appUrl: daemon.appUrl,
            }),
          })
          const pollBody = (await pollRes.json()) as { ok: boolean; polled: number }
          const listed = await runtime.cli('flows', 'list', '--json')

          // Assert
          expect(pollRes.status).toBe(200)
          expect(pollBody.polled).toBe(2)
          expect(listed.json<{ runs: unknown[] }>().runs).toHaveLength(0)
        } finally {
          await cassette.close()
        }
      },
    )
  })

  describe('When a matching Ready Linear issue polls twice', () => {
    it(
      'should orchestrate autospec once, keep commits inside ~/.difflab/worktrees/<run-id>/, and export FLOW.md, PLAN.md, REVIEW.md, logs.txt, and worktree git-log to e2e/outputs/',
      { tags: ['e2e', 'smoke', 'app', 'autospec', 'linear'] },
      async () => {
        // Arrange
        const { runtime } = getHarness()
        await runtime.writeRepoConfig(
          [
            'schemaVersion: 1',
            'project:',
            '  id: DIFFLAB',
            'flows:',
            '  defaultHarness: mock',
            '  retention: retain',
            '  triggers:',
            '    - on: linear.issue.ready',
            '      team: ENG',
            '      agent: difflab',
            '      labels:',
            '        - COMP:difflab',
            '      flow: autospec',
            '',
          ].join('\n'),
        )
        const cassette = await startCassetteServer(CASSETTE_PATH)

        try {
          const up = await runtime.cli('daemon', 'up', '--port', '0', '--json')
          expect(up.exitCode).toBe(0)
          const daemon = up.json<{ appUrl: string; engineUrl: string }>()

          const pollPayload = JSON.stringify({
            linearApiUrl: `${cassette.url}/graphql`,
            linearApiKey: 'lin_cassette_token',
            appUrl: daemon.appUrl,
          })

          // Act — poll twice to verify trigger_key deduplication while Ignoring ENG-41.
          const firstPoll = await fetch(`${daemon.engineUrl}/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: pollPayload,
          })
          const secondPoll = await fetch(`${daemon.engineUrl}/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: pollPayload,
          })
          expect(firstPoll.status).toBe(200)
          expect(secondPoll.status).toBe(200)

          const listed = await runtime.cli('flows', 'list', '--json')
          const runs = listed.json<{ runs: { id: string; triggerKey: string | null }[] }>().runs
          expect(runs).toHaveLength(1)
          const runId = runs[0]!.id
          expect(runs[0]!.triggerKey).toBe('linear:ENG-42:ready:autospec')

          const completed = await runtime.waitForRun(daemon.appUrl, runId, ['done'])
          await runtime.cli('flows', 'status', runId)
          await runtime.cli('flows', 'logs', runId)
          const outDir = await runtime.exportArtifacts('autospec-linear-ready', {
            appUrl: daemon.appUrl,
            runId,
          })

          // Assert
          expect(completed.run.status).toBe('done')
          expect(completed.steps.map((s) => s.stepId)).toEqual([
            'prepare-branch',
            'draft-plan',
            'implement',
            'remote-review',
            'address-remote',
            'publish-ready',
          ])
          expect(completed.steps.every((s) => s.status === 'done')).toBe(true)
          expect(completed.run.herdrPaneId).toBeTruthy()
          expect(completed.run.commitSha).toMatch(/^[0-9a-f]{40}$/)

          const flowMd = await readArtifactText(outDir, 'FLOW.md')
          const planMd = await readArtifactText(outDir, 'PLAN.md')
          const reviewMd = await readArtifactText(outDir, 'REVIEW.md')
          const logsTxt = await readArtifactText(outDir, 'logs.txt')
          const gitLog = await readArtifactText(outDir, 'worktree-git-log.txt')
          const locations = JSON.parse(await readArtifactText(outDir, 'locations.json')) as {
            primaryCheckoutHead: string
            primaryCheckoutStatusPorcelain: string
            worktreePath: string
            worktreeHead: string
          }

          expect(flowMd).toContain('- **Status:** completed')
          expect(flowMd).toContain('- [x] 1. prepare-branch')
          expect(flowMd).toContain('- [x] 6. publish-ready')
          expect(planMd).toContain('ENG-42: Implement local workflow loops')
          expect(reviewMd).toContain(completed.run.commitSha!)
          expect(logsTxt).toContain('Step 6 complete: publish-ready')
          expect(gitLog).toContain('feat: implement orchestrated workflow changes')
          expect(locations.primaryCheckoutStatusPorcelain).toBe('')
          expect(locations.worktreePath).toContain('.difflab/worktrees/')
          expect(locations.worktreeHead).not.toBe(locations.primaryCheckoutHead)
          expect(existsSync(join(runtime.repoDir, 'src/autospec-feature.ts'))).toBe(false)
        } finally {
          await cassette.close()
        }
      },
    )
  })

  describe('When a repository lacks mise.toml or a step crashes', () => {
    it(
      'should fail fast on missing mise.toml and retain the worktree on a step crash',
      { tags: ['e2e', 'app', 'autospec'] },
      async () => {
        // Arrange
        const { runtime } = getHarness()
        const up = await runtime.cliWithEnv(
          { DIFFLAB_MOCK_FAIL_STEP: 'implement' },
          'daemon',
          'up',
          '--port',
          '0',
          '--json',
        )
        expect(up.exitCode).toBe(0)
        const daemon = up.json<{ appUrl: string }>()

        // Act 1 — step crash retains the isolated worktree for inspection.
        const crashRun = await runtime.cli(
          'flows',
          'run',
          'autospec',
          '--input',
          'input=Crash test',
          '--harness',
          'mock',
          '--json',
        )
        expect(crashRun.exitCode).toBe(0)
        const crashId = crashRun.json<{ run: { id: string } }>().run.id
        const crashedDetail = await runtime.waitForRun(daemon.appUrl, crashId, ['failed'])

        // Act 2 — remove mise.toml and verify fast-fail blocker before creating a worktree.
        await rm(join(runtime.repoDir, 'mise.toml'), { force: true })
        const missingMiseRun = await runtime.cli(
          'flows',
          'run',
          'autospec',
          '--input',
          'input=Missing mise check',
          '--harness',
          'mock',
          '--json',
        )
        expect(missingMiseRun.exitCode).toBe(0)
        const missingMiseId = missingMiseRun.json<{ run: { id: string } }>().run.id
        const missingMiseDetail = await runtime.waitForRun(daemon.appUrl, missingMiseId, ['failed'])

        // Assert
        expect(crashedDetail.run.status).toBe('failed')
        expect(crashedDetail.run.worktreePath).toBeTruthy()
        expect(existsSync(crashedDetail.run.worktreePath!)).toBe(true)

        expect(missingMiseDetail.run.status).toBe('failed')
        expect(
          missingMiseDetail.messages.some((m) => m.message.includes('requires a mise.toml')),
        ).toBe(true)
      },
    )
  })
})
