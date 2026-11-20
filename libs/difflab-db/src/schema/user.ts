import { defineModel } from 'utils/model'
import { z } from 'zod'
import { isoTimestampSchema } from './common.js'

// Constants -------------------------------------------------------------------
/** Zod schema for a `users` record (mapped directly via Kysely `CamelCasePlugin`). */
export const userSchema = z.strictObject({
  id: z.string().min(1),
  email: z.string().trim().toLowerCase().email('User email must be valid'),
  displayName: z.string().trim().min(1, 'User display name must be nonempty'),
  createdAt: isoTimestampSchema,
})

// Types -----------------------------------------------------------------------
/** Cloud `User` model shared directly between Kysely (`CamelCasePlugin`) and application callers. */
export type User = z.infer<typeof userSchema>

// API -------------------------------------------------------------------------
/** Model definition for `User` records with generic `parse` and `validate`. */
export const UserModel = defineModel({ schema: userSchema })
