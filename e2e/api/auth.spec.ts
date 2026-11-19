import { afterEach, describe, expect, it } from 'bun:test'
import { Code, ConnectError, createDifflabClient } from 'difflab-client-ts'
import {
  createE2EContext,
  isTcpPortListening,
  reserveFreePort,
  type E2ETestContext,
} from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null

async function openContext(label: string): Promise<E2ETestContext> {
  const ctx = await createE2EContext('api', 'auth', label)
  activeCtx = ctx
  return ctx
}

// Tests -----------------------------------------------------------------------
describe('when starting difflab-api in cloud mode', () => {
  it('should exit nonzero before binding a TCP port given DIFFLAB_API_TOKEN is unset', async () => {
    // Arrange
    const ctx = await openContext(
      'when-starting-in-cloud-mode--exit-nonzero-given-missing-api-token',
    )
    const pgServer = await ctx.startPostgres()
    await ctx.runApiMigrate({ DATABASE_URL: pgServer.connectionString })
    const port = await reserveFreePort()

    // Act
    const failure = await ctx.startApiExpectingFailure({
      mode: 'cloud',
      port,
      env: {
        DATABASE_URL: pgServer.connectionString,
        DIFFLAB_API_TOKEN: undefined,
      },
    })

    // Assert
    expect(failure.exitCode).not.toBe(0)
    expect(failure.log).toContain('DIFFLAB_API_TOKEN')
    expect(await isTcpPortListening(port)).toBe(false)
  })
})

describe('when making RPC requests', () => {
  describe('given the service is in cloud mode', () => {
    it('should return 401 unauthenticated when the Bearer token is missing or mismatched', async () => {
      // Arrange
      const ctx = await openContext('cloud-mode--401-when-bearer-token-missing-or-mismatched')
      const pgServer = await ctx.startPostgres()
      await ctx.runApiMigrate({ DATABASE_URL: pgServer.connectionString })
      const server = await ctx.startApiServer({
        mode: 'cloud',
        env: {
          DATABASE_URL: pgServer.connectionString,
          DIFFLAB_API_TOKEN: 'secret-cloud-token',
        },
      })
      const missingTokenClient = createDifflabClient({
        mode: 'remote',
        rpcUrl: server.rpcUrl,
        workspaceId: 'ws-acme',
      })
      const wrongTokenClient = createDifflabClient({
        mode: 'remote',
        rpcUrl: server.rpcUrl,
        token: 'wrong-token',
        workspaceId: 'ws-acme',
      })

      // Act
      const missingErr = await captureConnectError(() =>
        missingTokenClient.projects.listProjects({}),
      )
      const wrongErr = await captureConnectError(() => wrongTokenClient.projects.listProjects({}))
      const rawHttp = await fetch(`${server.rpcUrl}/difflab.v1.ProjectService/ListProjects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-difflab-workspace': 'ws-acme' },
        body: '{}',
      })

      // Assert
      expect(missingErr.code).toBe(Code.Unauthenticated)
      expect(wrongErr.code).toBe(Code.Unauthenticated)
      expect(rawHttp.status).toBe(401)
    })

    it('should return 400 invalid_argument when x-difflab-workspace is missing', async () => {
      // Arrange
      const ctx = await openContext('cloud-mode--400-when-workspace-header-missing')
      const pgServer = await ctx.startPostgres()
      await ctx.runApiMigrate({ DATABASE_URL: pgServer.connectionString })
      const server = await ctx.startApiServer({
        mode: 'cloud',
        env: {
          DATABASE_URL: pgServer.connectionString,
          DIFFLAB_API_TOKEN: 'secret-cloud-token',
        },
      })
      const noWorkspaceClient = createDifflabClient({
        mode: 'remote',
        rpcUrl: server.rpcUrl,
        token: 'secret-cloud-token',
      })

      // Act
      const err = await captureConnectError(() => noWorkspaceClient.projects.listProjects({}))
      const rawHttp = await fetch(`${server.rpcUrl}/difflab.v1.ProjectService/ListProjects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret-cloud-token',
        },
        body: '{}',
      })

      // Assert
      expect(err.code).toBe(Code.InvalidArgument)
      expect(rawHttp.status).toBe(400)
    })

    it('should isolate records to the specified x-difflab-workspace', async () => {
      // Arrange
      const ctx = await openContext('cloud-mode--isolate-records-per-workspace')
      const pgServer = await ctx.startPostgres()
      await ctx.runApiMigrate({ DATABASE_URL: pgServer.connectionString })
      const server = await ctx.startApiServer({
        mode: 'cloud',
        env: {
          DATABASE_URL: pgServer.connectionString,
          DIFFLAB_API_TOKEN: 'secret-cloud-token',
        },
      })
      const acmeClient = createDifflabClient({
        mode: 'remote',
        rpcUrl: server.rpcUrl,
        token: 'secret-cloud-token',
        workspaceId: 'ws-acme',
      })
      const globexClient = createDifflabClient({
        mode: 'remote',
        rpcUrl: server.rpcUrl,
        token: 'secret-cloud-token',
        workspaceId: 'ws-globex',
      })

      // Act
      await acmeClient.projects.createProject({
        key: 'SHARED',
        name: 'Acme Shared Key',
        repositoryUrls: ['https://github.com/acme/shared.git'],
      })
      await globexClient.projects.createProject({
        key: 'SHARED',
        name: 'Globex Shared Key',
        repositoryUrls: ['https://github.com/acme/shared.git'],
      })
      const acmeList = await acmeClient.projects.listProjects({})
      const globexList = await globexClient.projects.listProjects({})

      // Assert
      expect(acmeList.projects.map((p) => `${p.workspaceId}:${p.name}`)).toEqual([
        'ws-acme:Acme Shared Key',
      ])
      expect(globexList.projects.map((p) => `${p.workspaceId}:${p.name}`)).toEqual([
        'ws-globex:Globex Shared Key',
      ])
    })
  })

  describe('given the service is in local mode', () => {
    it('should allow loopback requests without Bearer or workspace headers', async () => {
      // Arrange
      const ctx = await openContext('local-mode--allow-loopback-without-headers')
      const server = await ctx.startApiServer({ mode: 'local' })
      const client = createDifflabClient({ mode: 'local', rpcUrl: server.rpcUrl })

      // Act
      const response = await client.projects.listProjects({})

      // Assert
      expect(response.projects).toEqual([])
    })

    it('should scope records to the local workspace', async () => {
      // Arrange
      const ctx = await openContext('local-mode--scope-records-to-local-workspace')
      const server = await ctx.startApiServer({ mode: 'local' })
      const client = createDifflabClient({ mode: 'local', rpcUrl: server.rpcUrl })

      // Act
      const created = await client.projects.createProject({
        key: 'LOCAL1',
        name: 'Local Workspace Project',
        repositoryUrls: [],
      })

      // Assert
      expect(created.project?.workspaceId).toBe('local')
    })
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  if (activeCtx) {
    const current = activeCtx
    activeCtx = null
    await current.cleanup()
  }
})

// Helpers ---------------------------------------------------------------------
async function captureConnectError(operation: () => Promise<unknown>): Promise<ConnectError> {
  try {
    await operation()
    throw new Error('Expected ConnectError, but RPC succeeded')
  } catch (error) {
    expect(error).toBeInstanceOf(ConnectError)
    return error as ConnectError
  }
}
