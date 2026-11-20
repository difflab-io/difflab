import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { tryValidate } from 'utils/zodx'
import { isUniqueConstraintError, type DatabaseConfig } from '../db.js'
import { DifflabDbError, ProjectConflictError, ProjectValidationError } from '../errors.js'
import { UserModel, type DifflabDatabase, type User } from '../schema/index.js'

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
      const validated = UserModel.validate({
        id: input.id ?? randomUUID(),
        email: input.email,
        displayName: input.displayName,
        createdAt: new Date().toISOString(),
      })
      if (!validated.ok) {
        throw new ProjectValidationError(validated.error, { cause: validated.cause })
      }
      const user = validated.data
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
      const normalized = tryValidate(UserModel.schema.shape.email, email)
      if (!normalized.ok) {
        throw new ProjectValidationError(normalized.error, { cause: normalized.cause })
      }
      const row = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', normalized.data)
        .executeTakeFirst()
      return row ?? null
    },
  }
}
