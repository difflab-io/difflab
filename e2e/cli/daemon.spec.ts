import { describe, expect, it } from 'vitest'
import { useTestHarness } from '../common/fixtures.js'

// Setup -----------------------------------------------------------------------
const getHarness = useTestHarness('cli')

// Tests -----------------------------------------------------------------------
describe('Given a stopped difflab daemon', () => {
  describe('When running daemon up, status, and down', () => {
    it(
      'should start local services, report live URLs and PIDs, and stop cleanly',
      { tags: ['e2e', 'smoke', 'cli', 'daemon'] },
      async () => {
        // Arrange
        const { runtime } = getHarness()

        // Act
        const initialStatus = await runtime.cli('daemon', 'status', '--json')
        const up = await runtime.cli('daemon', 'up', '--port', '0', '--json')
        const activeStatus = await runtime.cli('daemon', 'status', '--json')
        const down = await runtime.cli('daemon', 'down', '--json')
        const finalStatus = await runtime.cli('daemon', 'status', '--json')
        await runtime.exportArtifacts('daemon-lifecycle')

        // Assert
        expect(initialStatus.json<{ running: boolean }>().running).toBe(false)
        expect(up.exitCode).toBe(0)

        const started = up.json<{
          running: boolean
          reused: boolean
          pid: number
          appUrl: string
          engineUrl: string
          daemonRigUrl: string
        }>()
        expect(started.running).toBe(true)
        expect(started.reused).toBe(false)
        expect(started.pid).toBeGreaterThan(0)
        expect(started.appUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
        expect(started.engineUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
        expect(started.daemonRigUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

        expect(activeStatus.json<{ running: boolean; appUrl: string }>()).toMatchObject({
          running: true,
          appUrl: started.appUrl,
        })
        expect(down.json<{ stopped: boolean }>()).toMatchObject({ stopped: true })
        expect(finalStatus.json<{ running: boolean }>().running).toBe(false)
      },
    )
  })
})

describe('Given a running difflab daemon', () => {
  describe('When running daemon up a second time', () => {
    it(
      'should reuse existing PIDs and service URLs idempotently',
      { tags: ['e2e', 'cli', 'daemon'] },
      async () => {
        // Arrange
        const { runtime } = getHarness()
        const firstUp = await runtime.cli('daemon', 'up', '--port', '0', '--json')
        const first = firstUp.json<{ pid: number; appUrl: string; daemonRigUrl: string }>()

        // Act
        const secondUp = await runtime.cli('daemon', 'up', '--port', '0', '--json')
        const second = secondUp.json<{
          reused: boolean
          pid: number
          appUrl: string
          daemonRigUrl: string
        }>()

        // Assert
        expect(second.reused).toBe(true)
        expect(second.pid).toBe(first.pid)
        expect(second.appUrl).toBe(first.appUrl)
        expect(second.daemonRigUrl).toBe(first.daemonRigUrl)
      },
    )
  })
})
