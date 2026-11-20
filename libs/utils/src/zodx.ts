import { isAbsolute } from 'node:path'
import { z } from 'zod'

// Types -----------------------------------------------------------------------
/** Discriminated validation outcome returned by `tryValidate` and `Model.validate`. */
export type ValidationResult<T> =
  { ok: true; data: T } | { ok: false; error: string; cause: z.ZodError }

// API -------------------------------------------------------------------------
/** Zod schema requiring an absolute filesystem path. */
export const absolutePath = z.string().refine(isAbsolute, 'path must be absolute')

/** Zod schema requiring a non-empty relative filesystem path. */
export const relativePath = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0 && !isAbsolute(value), 'path must be relative')

/** Zod schema requiring a single non-empty filename without directory separators. */
export const fileName = z
  .string()
  .refine(
    (value) => value.trim().length > 0 && value !== '.' && value !== '..' && !/[/\\\0]/.test(value),
    'filename must be a single non-empty file name',
  )

/** Validate `value` against `schema` and return `{ ok: true, data }` or `{ ok: false, error, cause }`. */
export function tryValidate<T>(schema: z.ZodType<T>, value: unknown): ValidationResult<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error), cause: parsed.error }
  }
  return { ok: true, data: parsed.data }
}

// Helpers ---------------------------------------------------------------------
function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ')
}
