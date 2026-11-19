import { Database as BunSqlite } from 'bun:sqlite'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import pg from 'pg'
import { lstatOrNull } from 'utils/fsx'
import { createIsolatedTestHome } from 'utils/testx'
import {
  createDifflabDb,
  migrateDatabase,
  MigrationError,
  ProjectConflictError,
  type DatabaseConfig,
} from './index.js'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
describe('when calling migrateDatabase', () => {
  it('should apply shared migrations and skip cloud migrations given a sqlite database', async () => {
    // Arrange
    const { config } = await makeSqliteFixture()

    // Act
    const applied = await migrateDatabase(config)
    const raw = new BunSqlite(config.path, { readonly: true })
    cleanups.push(async () => raw.close())
    const tables = raw
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)

    // Assert
    expect(applied).toEqual(['0001_initial'])
    expect(tables).toContain('projects')
    expect(tables).toContain('git_remotes')
    expect(tables).not.toContain('workspaces')
    expect(tables).not.toContain('users')
  })

  it('should apply shared and cloud migrations in order and enable tenant RLS given a PostgreSQL database', async () => {
    // Arrange
    const { config } = await makePostgresFixture()

    // Act
    const applied = await migrateDatabase(config)
    const client = new pg.Client({ connectionString: config.connectionString })
    await client.connect()
    cleanups.push(() => client.end())
    const rls = await client.query<{ relname: string; relrowsecurity: boolean }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('git_remotes', 'projects', 'workspace_members') ORDER BY relname",
    )
    const policies = await client.query<{ policyname: string }>(
      'SELECT policyname FROM pg_policies ORDER BY policyname',
    )

    // Assert
    expect(applied).toEqual(['0001_initial', '0002_cloud_tenancy'])
    expect(rls.rows).toEqual([
      { relname: 'git_remotes', relrowsecurity: true },
      { relname: 'projects', relrowsecurity: true },
      { relname: 'workspace_members', relrowsecurity: true },
    ])
    expect(policies.rows.map((row) => row.policyname)).toEqual([
      'workspace_isolation_git_remotes',
      'workspace_isolation_members',
      'workspace_isolation_projects',
    ])
  })
})

describe('when calling createDifflabDb', () => {
  for (const dialect of ['sqlite', 'postgres'] as const) {
    it(`should throw MigrationError without creating tables given an unmigrated ${dialect} database`, async () => {
      // Arrange
      const fixture = dialect === 'sqlite' ? await makeSqliteFixture() : await makePostgresFixture()

      // Act
      const openAttempt = createDifflabDb(fixture.config)

      // Assert
      await expect(openAttempt).rejects.toBeInstanceOf(MigrationError)
      if (fixture.config.dialect === 'sqlite') {
        expect(await lstatOrNull(fixture.config.path)).toBeNull()
      } else {
        const client = new pg.Client({ connectionString: fixture.config.connectionString })
        await client.connect()
        cleanups.push(() => client.end())
        const tables = await client.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
        )
        expect(tables.rows).toEqual([])
      }
    })

    it(`should succeed when all known applicable migrations are applied given unknown future rows in kysely_migration on ${dialect}`, async () => {
      // Arrange
      const fixture = dialect === 'sqlite' ? await makeSqliteFixture() : await makePostgresFixture()
      await migrateDatabase(fixture.config)
      await insertFutureMigrationRow(fixture.config, '9999_future_feature')

      // Act
      const db = await createDifflabDb(fixture.config)
      cleanups.push(() => db.close())
      const projects = await db.projects.listProjects()

      // Assert
      expect(projects).toEqual([])
    })
  }
})

describe('when writing projects, git remotes, and cloud memberships', () => {
  for (const dialect of ['sqlite', 'postgres'] as const) {
    it(`should isolate identical keys and URLs across workspaces while throwing ProjectConflictError within one workspace on ${dialect}`, async () => {
      // Arrange
      const fixture = dialect === 'sqlite' ? await makeSqliteFixture() : await makePostgresFixture()
      await migrateDatabase(fixture.config)
      const db = await createDifflabDb(fixture.config)
      cleanups.push(() => db.close())
      const alpha = { workspaceId: 'ws-alpha', userId: 'user-1' }
      const beta = { workspaceId: 'ws-beta', userId: 'user-2' }

      // Act
      const alphaProject = await db.projects.createProject(
        'CORE',
        'Alpha Core',
        ['git@github.com:difflab-io/core.git'],
        alpha,
      )
      const betaProject = await db.projects.createProject(
        'CORE',
        'Beta Core',
        ['https://github.com/difflab-io/core'],
        beta,
      )
      await db.projects.createProject('OTHER', 'Alpha Other', [], alpha)

      // Assert
      expect(alphaProject.workspaceId).toBe('ws-alpha')
      expect(betaProject.workspaceId).toBe('ws-beta')
      expect((await db.projects.listProjects(alpha)).map((p) => p.id)).toEqual(['CORE', 'OTHER'])
      expect((await db.projects.listProjects(beta)).map((p) => p.id)).toEqual(['CORE'])
      await expect(
        db.projects.createProject('CORE', 'Duplicate Key', [], alpha),
      ).rejects.toBeInstanceOf(ProjectConflictError)
      await expect(
        db.gitRemotes.linkGitRemoteToProject('OTHER', 'https://github.com/difflab-io/core', alpha),
      ).rejects.toBeInstanceOf(ProjectConflictError)
    })
  }

  it('should update role while preserving created_at given an existing workspace member on PostgreSQL', async () => {
    // Arrange
    const { config } = await makePostgresFixture()
    await migrateDatabase(config)
    const db = await createDifflabDb(config)
    cleanups.push(() => db.close())
    const workspace = await db.workspaces.createWorkspace({
      slug: 'difflab-cloud',
      name: 'Difflab Cloud',
    })
    const user = await db.users.createUser({
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
    })
    const initial = await db.workspaces.upsertMember({
      workspaceId: workspace.id,
      userId: user.id,
      role: 'member',
    })

    // Act
    await new Promise((resolve) => setTimeout(resolve, 15))
    const promoted = await db.workspaces.upsertMember({
      workspaceId: workspace.id,
      userId: user.id,
      role: 'admin',
    })

    // Assert
    expect(promoted.role).toBe('admin')
    expect(promoted.createdAt).toBe(initial.createdAt)
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

// Helpers ---------------------------------------------------------------------
async function makeSqliteFixture(): Promise<{
  config: Extract<DatabaseConfig, { dialect: 'sqlite' }>
}> {
  const isolated = await createIsolatedTestHome('difflab-db-sqlite-')
  cleanups.push(isolated.cleanup)
  return {
    config: {
      dialect: 'sqlite',
      path: join(isolated.home, 'local.sqlite'),
    },
  }
}

async function makePostgresFixture(): Promise<{
  config: Extract<DatabaseConfig, { dialect: 'postgres' }>
}> {
  const pglite = await PGlite.create()
  const server = new PGLiteSocketServer({
    db: pglite,
    host: '127.0.0.1',
    port: 0,
    maxConnections: 10,
  })
  await server.start()
  cleanups.push(async () => {
    await server.stop()
    await pglite.close()
  })
  return {
    config: {
      dialect: 'postgres',
      connectionString: `postgres://postgres@${server.getServerConn()}/postgres`,
    },
  }
}

async function insertFutureMigrationRow(config: DatabaseConfig, name: string): Promise<void> {
  const now = new Date().toISOString()
  if (config.dialect === 'sqlite') {
    const raw = new BunSqlite(config.path)
    try {
      raw.run('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)', [name, now])
    } finally {
      raw.close()
    }
    return
  }
  const client = new pg.Client({ connectionString: config.connectionString })
  await client.connect()
  try {
    await client.query('INSERT INTO kysely_migration (name, timestamp) VALUES ($1, $2)', [
      name,
      now,
    ])
  } finally {
    await client.end()
  }
}
