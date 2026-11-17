import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { OUTPUTS_ROOT, TestHarness } from '../common/test-harness.js'

// Tests -----------------------------------------------------------------------
test.describe('Given difflab-app open in Playwright (1120x640)', () => {
  test('When Project Home loads and autoreview runs via difflab flows run, then Helical UI renders Project Home and streams live Flows DAG over SSE @smoke', async ({
    page,
  }, testInfo) => {
    // Arrange
    const runtime = await TestHarness.create('web', {}, { name: testInfo.title })
    let failed = false

    try {
      const up = await runtime.cli('daemon', 'up', '--port', '0', '--json')
      expect(up.exitCode).toBe(0)
      const daemon = up.json<{ appUrl: string }>()

      await page.goto(daemon.appUrl)
      await expect(page.getByTestId('sse-status')).toContainText('SSE live', { timeout: 15_000 })
      await expect(page.getByTestId('project-selector')).toContainText('DIFFLAB')
      await expect(page.getByTestId('project-home')).toBeVisible()
      await expect(page.getByTestId('repo-component-graph')).toBeVisible()

      const homeShotBuffer = await page.screenshot({ fullPage: true })

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

      // Assert live SSE updates switch to Flows and stream DAG step transitions without reloading
      await expect(page.getByTestId('selected-flow-name')).toHaveText('autoreview', {
        timeout: 20_000,
      })
      await expect(page.getByTestId('selected-run-status')).toHaveText('done', {
        timeout: 60_000,
      })
      await expect(page.getByTestId('herdr-pane-badge')).toBeVisible()
      await expect(page.getByTestId('herdr-agent-badge')).toBeVisible()
      await expect(page.getByTestId('step-local-review')).toContainText('done')
      await expect(page.getByTestId('step-address-local')).toContainText('done')

      const outDir = await runtime.exportArtifacts('flows-ui-live', {
        appUrl: daemon.appUrl,
        runId,
      })
      await mkdir(join(OUTPUTS_ROOT, 'web'), { recursive: true })
      await writeFile(join(outDir, 'project-home.png'), homeShotBuffer)
      await page.screenshot({ path: join(outDir, 'flows-ui.png'), fullPage: true })
    } catch (error) {
      failed = true
      throw error
    } finally {
      await runtime.dispose(failed)
    }
  })
})
