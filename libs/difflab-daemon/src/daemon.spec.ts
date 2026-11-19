import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createIsolatedTestHome } from 'utils/testx'
import { ensureDaemon, getDaemonStatus, startDaemon, stopDaemon } from './index.js'

// Setup -----------------------------------------------------------------------
let testHome: Awaited<ReturnType<typeof createIsolatedTestHome>>
let serverScriptPath: string

beforeEach(async () => {
  testHome = await createIsolatedTestHome('difflab-daemon-')
  serverScriptPath = join(testHome.home, 'test-server.ts')
  await writeFile(
    serverScriptPath,
    `
import { writeDaemonMetadata } from ${JSON.stringify(join(import.meta.dir, 'index.ts'))}
const stateDir = process.argv[2]!
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(req) {
    if (new URL(req.url).pathname === '/health') {
      return Response.json({ ok: true })
    }
    return new Response('not found', { status: 404 })
  },
})
const serverUrl = \`http://127.0.0.1:\${server.port}\`
await writeDaemonMetadata(stateDir, {
  pid: process.pid,
  server_url: serverUrl,
  rpc_url: \`\${serverUrl}/rpc\`,
  started_at: new Date().toISOString(),
})
process.on('SIGTERM', () => {
  void server.stop(true).finally(() => process.exit(0))
})
`,
    'utf8',
  )
})

// Tests -----------------------------------------------------------------------
describe('given a stopped daemon', () => {
  it('should report running false and exit cleanly on stopDaemon', async () => {
    // Arrange
    const stateDir = join(testHome.home, 'state')

    // Act
    const initialStatus = await getDaemonStatus(stateDir)
    const stopped = await stopDaemon(stateDir)

    // Assert
    expect(initialStatus).toEqual({ running: false })
    expect(stopped).toEqual({ stopped: false })
  })

  it('should spawn the detached server, reuse it across concurrent ensureDaemon calls, and stop it cleanly', async () => {
    // Arrange
    const stateDir = join(testHome.home, 'state')
    const options = {
      stateDir,
      command: process.execPath,
      args: [serverScriptPath, stateDir],
    }

    // Act
    const started = await startDaemon(options)
    const [reusedA, reusedB] = await Promise.all([ensureDaemon(options), ensureDaemon(options)])
    const activeStatus = await getDaemonStatus(stateDir)
    const stopResult = await stopDaemon(stateDir)
    const afterStop = await getDaemonStatus(stateDir)

    // Assert
    expect(started.running).toBe(true)
    expect(reusedA).toEqual(started)
    expect(reusedB).toEqual(started)
    expect(activeStatus).toEqual(started)
    expect(stopResult).toEqual({ stopped: true, pid: started.pid })
    expect(afterStop).toEqual({ running: false })
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await stopDaemon(join(testHome.home, 'state')).catch(() => undefined)
  await testHome.cleanup()
})
