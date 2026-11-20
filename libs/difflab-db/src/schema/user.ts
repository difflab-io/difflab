import { tryValidate } from 'utils/zodx'
import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import { defineEntity, isoTimestampSchema } from './common.js'

// Constants -------------------------------------------------------------------
const emailSchema = z.string().email('User email must be valid')
const displayNameSchema = z.string().min(1, 'User display name must be nonempty')

/** Zod schema for a persisted snake_case SQL row in the `users` table (PostgreSQL cloud mode). */
export const userRowSchema = z.strictObject({
  id: z.string().min(1),
  email: emailSchema,
  display_name: displayNameSchema,
  created_at: isoTimestampSchema,
})

/** Zod schema for the camelCase `User` domain model. */
export const userSchema = z.strictObject({
  id: z.string().min(1),
  email: emailSchema,
  displayName: displayNameSchema,
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
/** Persisted SQL row shape for the `users` table. */
export type UserRow = z.infer<typeof userRowSchema>

/** Application-facing cloud `User` domain model. */
export type User = z.infer<typeof userSchema>

// API -------------------------------------------------------------------------
/** Entity definition for `users` rows, email/display-name validation, and `User` models. */
export const UserEntity = defineEntity({
  schema: userSchema,
  rowSchema: userRowSchema,
  fromRow(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
    }
  },
  methods: {
    /** Normalize and validate an email address. */
    normalizeEmail(rawEmail: string): string {
      return tryValidate(
        emailSchema,
        rawEmail.trim().toLowerCase(),
        (message, cause) => new ProjectValidationError(message, { cause }),
      )
    },
    /** Trim and validate a user display name. */
    validateDisplayName(rawName: string): string {
      return tryValidate(
        displayNameSchema,
        rawName.trim(),
        (message, cause) => new ProjectValidationError(message, { cause }),
      )
    },
  },
})
