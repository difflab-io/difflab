import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { isUniqueConstraintError, type DatabaseConfig } from '../dialects.js'
import { DifflabDbError, ProjectConflictError, ProjectValidationError } from '../errors.js'
import type { DifflabDatabase, User, UsersTable } from '../schema.js'

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
      const email = input.email.trim().toLowerCase()
      const displayName = input.displayName.trim()
      if (!email.includes('@')) {
        throw new ProjectValidationError('User email must be valid')
      }
      if (!displayName) {
        throw new ProjectValidationError('User display name must be nonempty')
      }
      const row: UsersTable = {
        id: input.id ?? randomUUID(),
        email,
        display_name: displayName,
        created_at: new Date().toISOString(),
      }
      try {
        await db.insertInto('users').values(row).execute()
        return toUser(row)
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
        .where('email', '=', email.trim().toLowerCase())
        .executeTakeFirst()
      return row ? toUser(row) : null
    },
  }
}

// Helpers ---------------------------------------------------------------------
function toUser(row: UsersTable): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  }
}
