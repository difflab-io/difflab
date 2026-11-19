import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'
import { isoTimestampSchema } from './common.js'

// Constants -------------------------------------------------------------------
export const userRowSchema = z.strictObject({
  id: z.string().min(1),
  email: z.string().email(),
  display_name: z.string().min(1),
  created_at: isoTimestampSchema,
})

export const userSchema = z.strictObject({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
export type UserRow = z.infer<typeof userRowSchema>
export type User = z.infer<typeof userSchema>

// API -------------------------------------------------------------------------
export const UserEntity = {
  schema: userSchema,
  rowSchema: userRowSchema,
  normalizeEmail(rawEmail: string): string {
    const email = rawEmail.trim().toLowerCase()
    if (!z.string().email().safeParse(email).success) {
      throw new ProjectValidationError('User email must be valid')
    }
    return email
  },
  validateDisplayName(rawName: string): string {
    const trimmed = rawName.trim()
    if (!trimmed) {
      throw new ProjectValidationError('User display name must be nonempty')
    }
    return trimmed
  },
  parse(value: unknown): User {
    return userSchema.parse(value)
  },
  fromRow(row: UserRow): User {
    return userSchema.parse({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
    })
  },
}
