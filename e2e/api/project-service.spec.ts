import { afterEach, describe, expect, it } from 'bun:test'
import { Code, ConnectError, createDifflabClient } from 'difflab-client-ts'
import { createE2EContext, type E2ETestContext } from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null

async function openService(label: string) {
  const ctx = await createE2EContext('api', 'project-service', label)
  activeCtx = ctx
  const server = await ctx.startApiServer({ mode: 'local' })
  const client = createDifflabClient({ mode: 'local', rpcUrl: server.rpcUrl })
  return { ctx, server, client }
}

// Tests -----------------------------------------------------------------------
describe('given a running ProjectService', () => {
  describe('when calling CreateProject', () => {
    it('should return 400 invalid_argument given an invalid project key or repository URL', async () => {
      // Arrange
      const { ctx, server, client } = await openService(
        'create-project--400-given-invalid-key-or-url',
      )

      // Act
      const invalidKeyErr = await captureConnectError(() =>
        client.projects.createProject({
          key: '9BAD!',
          name: 'Invalid Key',
          repositoryUrls: [],
        }),
      )
      const invalidUrlErr = await captureConnectError(() =>
        client.projects.createProject({
          key: 'VALID',
          name: 'Invalid URL',
          repositoryUrls: ['not-a-valid-git-url'],
        }),
      )
      const invalidKeyHttp = await fetch(
        `${server.rpcUrl}/difflab.v1.ProjectService/CreateProject`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: '1', name: 'Too Short' }),
        },
      )

      // Assert
      expect(invalidKeyErr.code).toBe(Code.InvalidArgument)
      expect(invalidUrlErr.code).toBe(Code.InvalidArgument)
      expect(invalidKeyHttp.status).toBe(400)
      expect(await ctx.readApiLog()).toContain('difflab-api.rpc')
    })

    it('should persist the project and canonical repository links given a valid new project', async () => {
      // Arrange
      const { client } = await openService('create-project--persist-valid-project-and-links')

      // Act
      const response = await client.projects.createProject({
        key: 'difflab',
        name: 'Difflab Core',
        repositoryUrls: ['git@github.com:difflab-io/difflab.git'],
      })

      // Assert
      expect(response.project?.key).toBe('DIFFLAB')
      expect(response.project?.name).toBe('Difflab Core')
      expect(response.project?.repositories.map((repo) => repo.remoteUrl)).toEqual([
        'https://github.com/difflab-io/difflab',
      ])
      expect(response.project?.repositories.map((repo) => repo.slug)).toEqual([
        'github.com--difflab-io--difflab',
      ])
    })

    it('should return 409 already_exists given a duplicate project key in the same workspace', async () => {
      // Arrange
      const { server, client } = await openService(
        'create-project--409-given-duplicate-project-key',
      )
      await client.projects.createProject({
        key: 'DUPE',
        name: 'Original Project',
        repositoryUrls: [],
      })

      // Act
      const err = await captureConnectError(() =>
        client.projects.createProject({
          key: 'dupe',
          name: 'Conflicting Project',
          repositoryUrls: [],
        }),
      )
      const duplicateHttp = await fetch(
        `${server.rpcUrl}/difflab.v1.ProjectService/CreateProject`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'DUPE', name: 'Conflicting Project' }),
        },
      )

      // Assert
      expect(err.code).toBe(Code.AlreadyExists)
      expect(duplicateHttp.status).toBe(409)
    })
  })

  describe('when calling GetProject and ListProjects', () => {
    it('should return projects with their linked repositories given existing projects', async () => {
      // Arrange
      const { client } = await openService('get-and-list--return-projects-with-repositories')
      await client.projects.createProject({
        key: 'BETA',
        name: 'Beta Service',
        repositoryUrls: ['https://github.com/acme/beta.git'],
      })
      await client.projects.createProject({
        key: 'ALPHA',
        name: 'Alpha Service',
        repositoryUrls: ['https://github.com/acme/alpha.git'],
      })

      // Act
      const listed = await client.projects.listProjects({})
      const fetched = await client.projects.getProject({ key: 'alpha' })

      // Assert
      expect(listed.projects.map((p) => p.key)).toEqual(['ALPHA', 'BETA'])
      expect(fetched.project?.key).toBe('ALPHA')
      expect(fetched.project?.repositories.map((r) => r.remoteUrl)).toEqual([
        'https://github.com/acme/alpha',
      ])
    })

    it('should return 404 not_found given an unknown project key', async () => {
      // Arrange
      const { server, client } = await openService('get-project--404-given-unknown-key')

      // Act
      const err = await captureConnectError(() => client.projects.getProject({ key: 'MISSING' }))
      const rawHttp = await fetch(`${server.rpcUrl}/difflab.v1.ProjectService/GetProject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'MISSING' }),
      })

      // Assert
      expect(err.code).toBe(Code.NotFound)
      expect(rawHttp.status).toBe(404)
    })
  })

  describe('when calling LinkRepository', () => {
    it('should attach the normalized repository link given an existing project and unlinked URL', async () => {
      // Arrange
      const { client } = await openService('link-repository--attach-normalized-link')
      await client.projects.createProject({
        key: 'PLATFORM',
        name: 'Platform',
        repositoryUrls: [],
      })

      // Act
      const firstLink = await client.projects.linkRepository({
        projectKey: 'platform',
        remoteUrl: 'git@github.com:acme/platform-web.git',
      })
      const idempotentLink = await client.projects.linkRepository({
        projectKey: 'PLATFORM',
        remoteUrl: 'https://github.com/acme/platform-web',
      })

      // Assert
      expect(firstLink.repository?.remoteUrl).toBe('https://github.com/acme/platform-web')
      expect(idempotentLink.repository?.id).toBe(firstLink.repository?.id)
    })

    it('should return 409 already_exists given a URL already linked to another project in the same workspace', async () => {
      // Arrange
      const { server, client } = await openService(
        'link-repository--409-given-url-linked-to-another-project',
      )
      await client.projects.createProject({
        key: 'ONE',
        name: 'Project One',
        repositoryUrls: ['https://github.com/acme/shared-repo.git'],
      })
      await client.projects.createProject({
        key: 'TWO',
        name: 'Project Two',
        repositoryUrls: [],
      })

      // Act
      const err = await captureConnectError(() =>
        client.projects.linkRepository({
          projectKey: 'TWO',
          remoteUrl: 'git@github.com:acme/shared-repo.git',
        }),
      )
      const conflictHttp = await fetch(
        `${server.rpcUrl}/difflab.v1.ProjectService/LinkRepository`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectKey: 'TWO',
            remoteUrl: 'https://github.com/acme/shared-repo',
          }),
        },
      )

      // Assert
      expect(err.code).toBe(Code.AlreadyExists)
      expect(conflictHttp.status).toBe(409)
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
