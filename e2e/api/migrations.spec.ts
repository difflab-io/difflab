import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { createDifflabClient } from 'difflab-client-ts'
import pg from 'pg'
import { lstatOrNull } from 'utils/fsx'
import {
  createUnmigratedNonLegacySqlite,
  seedLegacyDatabase,
  sha256File,
} from '../common/fixtures.js'
import {
  createE2EContext,
  isTcpPortListening,
  reserveFreePort,
  type E2ETestContext,
} from '../common/test-harness.js'

// Setup -----------------------------------------------------------------------
let activeCtx: E2ETestContext | null = null

async function openContext(label: string): Promise<E2ETestContext> {
  const ctx = await createE2EContext('api', 'migrations', label)
  activeCtx = ctx
  return ctx
}

// Tests -----------------------------------------------------------------------
describe('when starting difflab-api', () => {
  it('should create local.sqlite and apply shared migrations given no database exists', async () => {
    // Arrange
    const ctx = await openContext('when-starting-difflab-api--create-local-sqlite-given-no-db')

    // Act
    const server = await ctx.startApiServer({ mode: 'local' })
    const client = createDifflabClient({ mode: 'local', rpcUrl: server.rpcUrl })
    const listResponse = await client.projects.listProjects({})
    await server.stop()

    // Assert
    const localDbPath = join(ctx.difflabHome, 'local.sqlite')
    expect(await lstatOrNull(localDbPath)).not.toBeNull()
    expect(listResponse.projects).toEqual([])
    expect(readSqliteMigrationNames(localDbPath)).toEqual(['0001_initial'])
  })

  describe('given a legacy v0.13.0 difflab.sqlite exists without local.sqlite', () => {
    it('should create local.sqlite and import legacy projects and repository links', async () => {
      // Arrange
      const ctx = await openContext(
        'when-starting-difflab-api--import-legacy-projects-into-local-sqlite',
      )
      const legacyPath = join(ctx.difflabHome, 'difflab.sqlite')
      await seedLegacyDatabase(legacyPath, [
        {
          key: 'LEGACY',
          name: 'Legacy Imported Project',
          origins: ['git@github.com:acme/legacy-service.git'],
        },
      ])

      // Act
      const server = await ctx.startApiServer({ mode: 'local' })
      const client = createDifflabClient({ mode: 'local', rpcUrl: server.rpcUrl })
      const { projects } = await client.projects.listProjects({})

      // Assert
      expect(await lstatOrNull(join(ctx.difflabHome, 'local.sqlite'))).not.toBeNull()
      expect(projects).toHaveLength(1)
      expect(projects[0]?.key).toBe('LEGACY')
      expect(projects[0]?.name).toBe('Legacy Imported Project')
      expect(projects[0]?.repositories.map((repo) => repo.remoteUrl)).toEqual([
        'https://github.com/acme/legacy-service',
      ])
    })

    it('should leave difflab.sqlite byte-identical', async () => {
      // Arrange
      const ctx = await openContext(
        'when-starting-difflab-api--leave-legacy-difflab-sqlite-byte-identical',
      )
      const legacyPath = join(ctx.difflabHome, 'difflab.sqlite')
      const beforeSha = await seedLegacyDatabase(legacyPath, [
        {
          key: 'FROZEN',
          name: 'Frozen v1 Store',
          origins: ['https://github.com/acme/frozen-repo.git'],
        },
      ])

      // Act
      const server = await ctx.startApiServer({ mode: 'local' })
      const client = createDifflabClient({ mode: 'local', rpcUrl: server.rpcUrl })
      await client.projects.createProject({
        key: 'NEWV2',
        name: 'New v2 Only Project',
        repositoryUrls: ['https://github.com/acme/new-v2-repo.git'],
      })
      await server.stop()

      // Assert
      const afterSha = await sha256File(legacyPath)
      expect(afterSha).toBe(beforeSha)
    })
  })

  it('should start cleanly without re-seeding given local.sqlite already has applied migrations', async () => {
    // Arrange
    const ctx = await openContext(
      'when-starting-difflab-api--reuse-migrated-local-sqlite-without-reseeding',
    )
    const firstServer = await ctx.startApiServer({ mode: 'local' })
    const firstClient = createDifflabClient({ mode: 'local', rpcUrl: firstServer.rpcUrl })
    await firstClient.projects.createProject({
      key: 'ALPHA',
      name: 'Alpha Project',
      repositoryUrls: [],
    })
    await firstServer.stop()

    await seedLegacyDatabase(join(ctx.difflabHome, 'difflab.sqlite'), [
      { key: 'LATEV1', name: 'Added Later In v1' },
    ])

    // Act
    const secondServer = await ctx.startApiServer({ mode: 'local' })
    const secondClient = createDifflabClient({ mode: 'local', rpcUrl: secondServer.rpcUrl })
    const { projects } = await secondClient.projects.listProjects({})

    // Assert
    expect(projects.map((project) => project.key)).toEqual(['ALPHA'])
  })

  describe('given a non-legacy database with no existing migrations', () => {
    it('should exit nonzero and log the schema error to api.log', async () => {
      // Arrange
      const ctx = await openContext(
        'when-starting-difflab-api--exit-nonzero-given-unmigrated-non-legacy-db',
      )
      createUnmigratedNonLegacySqlite(join(ctx.difflabHome, 'local.sqlite'))

      // Act
      const failure = await ctx.startApiExpectingFailure({ mode: 'local' })

      // Assert
      expect(failure.exitCode).not.toBe(0)
      expect(failure.log).toContain('Database schema is not initialized')
    })

    it('should bind no TCP port', async () => {
      // Arrange
      const ctx = await openContext(
        'when-starting-difflab-api--bind-no-port-given-unmigrated-non-legacy-db',
      )
      const port = await reserveFreePort()
      createUnmigratedNonLegacySqlite(join(ctx.difflabHome, 'local.sqlite'))

      // Act
      const failure = await ctx.startApiExpectingFailure({ mode: 'local', port })

      // Assert
      expect(failure.exitCode).not.toBe(0)
      expect(await isTcpPortListening(port)).toBe(false)
    })
  })
})

describe('when running difflab-api migrate on PostgreSQL', () => {
  it('should apply shared and cloud migrations in order given an unmigrated database', async () => {
    // Arrange
    const ctx = await openContext('when-running-difflab-api-migrate-on-postgresql')
    const pgServer = await ctx.startPostgres()

    // Act
    const migrateResult = await ctx.runApiMigrate({
      DATABASE_URL: pgServer.connectionString,
    })

    // Assert
    expect(migrateResult.exitCode).toBe(0)
    const appliedNames = await readPostgresMigrationNames(pgServer.connectionString)
    expect(appliedNames).toEqual(['0001_initial', '0002_cloud_tenancy'])
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
function readSqliteMigrationNames(sqlitePath: string): string[] {
  const raw = new Database(sqlitePath, { readonly: true })
  try {
    const rows = raw
      .query<{ name: string }, []>('SELECT name FROM kysely_migration ORDER BY name ASC')
      .all()
    return rows.map((row) => row.name)
  } finally {
    raw.close()
  }
}

async function readPostgresMigrationNames(connectionString: string): Promise<string[]> {
  const pool = new pg.Pool({ connectionString })
  try {
    const result = await pool.query<{ name: string }>(
      'SELECT name FROM kysely_migration ORDER BY name ASC',
    )
    return result.rows.map((row) => row.name)
  } finally {
    await pool.end()
  }
}
