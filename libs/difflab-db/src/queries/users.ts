import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { isUniqueConstraintError } from '../db.js'
import { DifflabDbError, ProjectConflictError } from '../errors.js'
import { UserEntity, type DifflabDatabase, type User, type UserRow } from '../schema/index.js'
import type { DatabaseConfig } from '../db.js'

// API -------------------------------------------------------------------------
export function createUserQueries(db: Kysely<DifflabDatabase>, dialect: DatabaseConfig['dialect']) {
  const assertCloudDialect = () => {
    if (dialect !== 'postgres') {
      throw new DifflabDbError('User queries require a PostgreSQL database')
    }
  }

  return {
    async createUser(input: { id?: string; email: string; displayName: string }): Promise<User> {
      assertCloudDialect()
      const email = UserEntity.normalizeEmail(input.email)
      const displayName = UserEntity.validateDisplayName(input.displayName)
      const row: UserRow = {
        id: input.id ?? randomUUID(),
        email,
        display_name: displayName,
        created_at: new Date().toISOString(),
      }
      try {
        await db.insertInto('users').values(row).execute()
        return UserEntity.fromRow(row)
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(`User already exists: ${email}`, { cause: error })
        }
        throw error
      }
    },

    async getUserByEmail(email: string): Promise<User | null> {
      assertCloudDialect()
      const row = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', UserEntity.normalizeEmail(email))
        .executeTakeFirst()
      return row ? UserEntity.fromRow(row) : null
    },
  }
}
