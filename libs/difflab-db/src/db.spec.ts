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
const cleanups: Array<() => Promise<void>> = []

// Tests -----------------------------------------------------------------------
describe('DifflabDb.migrate and DifflabDb.fromConfig', () => {
  it('should apply only shared migrations on SQLite and skip cloud-only tables', async () => {
    // Arrange
    const config = await openSqliteConfig()

    // Act
    const applied = await DifflabDb.migrate(config)

    // Assert
    expect(applied).toEqual(['0001_initial'])
    const raw = new Database(config.path, { readonly: true })
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
    const config = await openPostgresConfig()

    // Act
    const applied = await DifflabDb.migrate(config)

    // Assert
    expect(applied).toEqual(['0001_initial', '0002_cloud_tenancy'])
    const pool = new pg.Pool({ connectionString: config.connectionString })
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

describe('DifflabDb workspace isolation', () => {
  for (const dialect of ['sqlite', 'postgres'] as const) {
    describe(`given a migrated ${dialect} database with project ALPHA in workspace ws-a`, () => {
      it('then creating the same project key and Git remote URL in workspace ws-b succeeds', async () => {
        // Arrange
        const db = await openMigratedDb(dialect)
        const actorA = { workspaceId: 'ws-a', userId: 'u-1' }
        const actorB = { workspaceId: 'ws-b', userId: 'u-2' }
        await db.projects.createProject(
          'alpha',
          'Alpha A',
          ['git@github.com:acme/shared.git'],
          actorA,
        )

        // Act
        const projB = await db.projects.createProject(
          'ALPHA',
          'Alpha B',
          ['https://github.com/acme/shared'],
          actorB,
        )

        // Assert
        expect(projB.key).toBe('ALPHA')
        expect(projB.workspaceId).toBe('ws-b')
      })

      it('then creating a duplicate project key in workspace ws-a rejects with ProjectConflictError', async () => {
        // Arrange
        const db = await openMigratedDb(dialect)
        const actorA = { workspaceId: 'ws-a', userId: 'u-1' }
        await db.projects.createProject('ALPHA', 'Alpha A', [], actorA)

        // Act / Assert
        await expect(
          db.projects.createProject('ALPHA', 'Duplicate', [], actorA),
        ).rejects.toBeInstanceOf(ProjectConflictError)
      })

      it('then linking a Git remote already owned by ALPHA to BETA in workspace ws-a rejects with ProjectConflictError', async () => {
        // Arrange
        const db = await openMigratedDb(dialect)
        const actorA = { workspaceId: 'ws-a', userId: 'u-1' }
        await db.projects.createProject(
          'ALPHA',
          'Alpha A',
          ['git@github.com:acme/shared.git'],
          actorA,
        )
        await db.projects.createProject('BETA', 'Beta A', [], actorA)

        // Act / Assert
        await expect(
          db.gitRemotes.linkGitRemoteToProject(
            'BETA',
            'https://github.com/acme/shared.git',
            actorA,
          ),
        ).rejects.toBeInstanceOf(ProjectConflictError)
      })
    })
  }
})

describe('DifflabDb cloud workspace memberships', () => {
  describe('given an existing workspace member on PostgreSQL', () => {
    it('when upserting a new role, then the role updates without changing createdAt', async () => {
      // Arrange
      const db = await openMigratedDb('postgres')
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
async function openSqliteConfig(): Promise<Extract<DatabaseConfig, { dialect: 'sqlite' }>> {
  const testHome = await createIsolatedTestHome('difflab-db-sqlite-')
  cleanups.push(testHome.cleanup)
  return { dialect: 'sqlite', path: join(testHome.home, 'local.sqlite') }
}

async function openPostgresConfig(): Promise<Extract<DatabaseConfig, { dialect: 'postgres' }>> {
  const pglite = new PGlite()
  await pglite.waitReady
  const server = new PGLiteSocketServer({
    db: pglite,
    host: '127.0.0.1',
    port: 0,
    maxConnections: 15,
  })
  await server.start()
  cleanups.push(async () => {
    await server.stop()
    await pglite.close()
  })
  return {
    dialect: 'postgres',
    connectionString: `postgres://postgres@${server.getServerConn()}/postgres`,
  }
}

async function openMigratedDb(dialect: 'sqlite' | 'postgres'): Promise<DifflabDb> {
  const config = dialect === 'sqlite' ? await openSqliteConfig() : await openPostgresConfig()
  await DifflabDb.migrate(config)
  const db = await DifflabDb.fromConfig(config)
  cleanups.push(() => db.close())
  return db
}
