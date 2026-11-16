import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { OUTPUTS_ROOT, TestHarness } from '../common/test-harness.js'

// Tests -----------------------------------------------------------------------
test.describe('Given difflab-app open in Playwright (1120x640)', () => {
  test('When autoreview runs via difflab flows run, then SSE streams live step status and Herdr badges @smoke', async ({
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

      // Assert live SSE updates without reloading the page
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
      await page.screenshot({ path: join(outDir, 'flows-ui.png'), fullPage: true })
    } catch (error) {
      failed = true
      throw error
    } finally {
      await runtime.dispose(failed)
    }
  })
})
