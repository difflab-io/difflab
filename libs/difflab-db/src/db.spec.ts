import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { afterEach, describe, expect, it } from 'bun:test'
import pg from 'pg'
import { lstatOrNull } from 'utils/fsx'
import { createIsolatedTestHome } from 'utils/testx'
import { DifflabDb, MigrationError, ProjectConflictError, type DatabaseConfig } from './index.js'

// Setup -----------------------------------------------------------------------
type DialectHarness = {
  config: DatabaseConfig
  cleanup: () => Promise<void>
}

const cleanups: Array<() => Promise<void>> = []

// Tests -----------------------------------------------------------------------
describe('DifflabDb.migrate and DifflabDb.fromConfig', () => {
  it('should apply only shared migrations on SQLite and skip cloud-only tables', async () => {
    // Arrange
    const harness = await openHarness('sqlite')

    // Act
    const applied = await DifflabDb.migrate(harness.config)

    // Assert
    expect(applied).toEqual(['0001_initial'])
    const raw = new Database((harness.config as { dialect: 'sqlite'; path: string }).path, {
      readonly: true,
    })
    const tableNames = raw
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
    raw.close()
    expect(tableNames).toContain('projects')
    expect(tableNames).toContain('git_remotes')
    expect(tableNames).not.toContain('workspaces')
    expect(tableNames).not.toContain('users')
  })

  it('should apply shared and cloud migrations in order on PostgreSQL', async () => {
    // Arrange
    const harness = await openHarness('postgres')

    // Act
    const applied = await DifflabDb.migrate(harness.config)

    // Assert
    expect(applied).toEqual(['0001_initial', '0002_cloud_tenancy'])
    const pool = new pg.Pool({
      connectionString: (harness.config as { dialect: 'postgres'; connectionString: string })
        .connectionString,
    })
    const tables = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    )
    await pool.end()
    const names = tables.rows.map((row) => row.tablename)
    expect(names).toEqual(
      expect.arrayContaining([
        'projects',
        'git_remotes',
        'workspaces',
        'users',
        'workspace_members',
      ]),
    )
  })

  it('should reject an unmigrated SQLite path without creating files', async () => {
    // Arrange
    const testHome = await createIsolatedTestHome('difflab-db-unmigrated-')
    cleanups.push(testHome.cleanup)
    const missingDb = join(testHome.home, 'missing.sqlite')

    // Act / Assert
    await expect(
      DifflabDb.fromConfig({ dialect: 'sqlite', path: missingDb }),
    ).rejects.toBeInstanceOf(MigrationError)
    expect(await lstatOrNull(missingDb)).toBeNull()
  })
})

describe('DifflabDb workspace isolation and cloud tenancy contracts', () => {
  for (const dialect of ['sqlite', 'postgres'] as const) {
    it(`should isolate identical keys and remote URLs across workspaces while rejecting conflicts within one workspace on ${dialect}`, async () => {
      // Arrange
      const harness = await openHarness(dialect)
      await DifflabDb.migrate(harness.config)
      const db = await DifflabDb.fromConfig(harness.config)
      cleanups.push(() => db.close())
      const actorA = { workspaceId: 'ws-a', userId: 'u-1' }
      const actorB = { workspaceId: 'ws-b', userId: 'u-2' }

      // Act
      const projA = await db.projects.createProject(
        'alpha',
        'Alpha A',
        ['git@github.com:acme/shared.git'],
        actorA,
      )
      const projB = await db.projects.createProject(
        'ALPHA',
        'Alpha B',
        ['https://github.com/acme/shared'],
        actorB,
      )

      // Assert
      expect(projA.workspaceId).toBe('ws-a')
      expect(projB.workspaceId).toBe('ws-b')
      await expect(
        db.projects.createProject('ALPHA', 'Duplicate', [], actorA),
      ).rejects.toBeInstanceOf(ProjectConflictError)
      await db.projects.createProject('BETA', 'Beta A', [], actorA)
      await expect(
        db.gitRemotes.linkGitRemoteToProject('BETA', 'https://github.com/acme/shared.git', actorA),
      ).rejects.toBeInstanceOf(ProjectConflictError)
    })
  }

  describe('when updating an existing workspace member role on PostgreSQL', () => {
    it('should update the role without changing created_at', async () => {
      // Arrange
      const harness = await openHarness('postgres')
      await DifflabDb.migrate(harness.config)
      const db = await DifflabDb.fromConfig(harness.config)
      cleanups.push(() => db.close())
      const ws = await db.workspaces.createWorkspace({ slug: 'acme-team', name: 'Acme Team' })
      const user = await db.users.createUser({ email: 'Alice@Example.com', displayName: 'Alice' })
      const initial = await db.workspaces.upsertMember({
        workspaceId: ws.id,
        userId: user.id,
        role: 'member',
      })

      // Act
      const promoted = await db.workspaces.upsertMember({
        workspaceId: ws.id,
        userId: user.id,
        role: 'admin',
      })

      // Assert
      expect(promoted.role).toBe('admin')
      expect(promoted.createdAt).toBe(initial.createdAt)
    })
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop()
    await fn?.()
  }
})

// Helpers ---------------------------------------------------------------------
async function openHarness(dialect: 'sqlite' | 'postgres'): Promise<DialectHarness> {
  if (dialect === 'sqlite') {
    const testHome = await createIsolatedTestHome('difflab-db-sqlite-')
    const cleanup = () => testHome.cleanup()
    cleanups.push(cleanup)
    return {
      config: { dialect: 'sqlite', path: join(testHome.home, 'local.sqlite') },
      cleanup,
    }
  }

  const pglite = new PGlite()
  await pglite.waitReady
  const server = new PGLiteSocketServer({
    db: pglite,
    host: '127.0.0.1',
    port: 0,
    maxConnections: 15,
  })
  await server.start()
  const connectionString = `postgres://postgres@${server.getServerConn()}/postgres`
  const cleanup = async () => {
    await server.stop()
    await pglite.close()
  }
  cleanups.push(cleanup)
  return {
    config: { dialect: 'postgres', connectionString },
    cleanup,
  }
}
