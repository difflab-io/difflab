import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { tryValidate } from 'utils/zodx'
import { isUniqueConstraintError, type DatabaseConfig } from '../db.js'
import { DifflabDbError, ProjectConflictError, ProjectValidationError } from '../errors.js'
import { UserEntity, type DifflabDatabase, type User } from '../schema/index.js'

// API -------------------------------------------------------------------------
/** Create cloud user queries bound to a PostgreSQL Kysely instance. */
export function createUserQueries(db: Kysely<DifflabDatabase>, dialect: DatabaseConfig['dialect']) {
  const assertCloudDialect = () => {
    if (dialect !== 'postgres') {
      throw new DifflabDbError('User queries require a PostgreSQL database')
    }
  }

  return {
    async createUser(input: { id?: string; email: string; displayName: string }): Promise<User> {
      assertCloudDialect()
      const user = UserEntity.validate(
        {
          id: input.id ?? randomUUID(),
          email: input.email,
          displayName: input.displayName,
          createdAt: new Date().toISOString(),
        },
        (message, cause) => new ProjectValidationError(message, { cause }),
      )
      try {
        await db.insertInto('users').values(user).execute()
        return user
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ProjectConflictError(`User already exists: ${user.email}`, { cause: error })
        }
        throw error
      }
    },

    async getUserByEmail(email: string): Promise<User | null> {
      assertCloudDialect()
      const normalized = tryValidate(
        UserEntity.schema.shape.email,
        email,
        (message, cause) => new ProjectValidationError(message, { cause }),
      )
      const row = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', normalized)
        .executeTakeFirst()
      return row ? UserEntity.parse(row) : null
    },
  }
}
