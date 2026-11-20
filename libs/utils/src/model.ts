import type { z } from 'zod'
import { tryValidate } from './zodx.js'

// Types -----------------------------------------------------------------------
/** Base contract shared by Zod-backed domain models with generic `parse` and `validate` helpers. */
export type Model<
  TSchema extends z.ZodType,
  TExtra extends Record<string, unknown> = Record<string, never>,
> = {
  readonly schema: TSchema
  readonly parse: (value: unknown) => z.infer<TSchema>
  readonly validate: (
    value: unknown,
    toError?: (message: string, cause: z.ZodError) => Error,
  ) => z.infer<TSchema>
} & TExtra

// API -------------------------------------------------------------------------
/** Define a typed domain model pairing a Zod schema with generic `parse`, `validate`, and optional helpers. */
export function defineModel<
  TSchema extends z.ZodType,
  TExtra extends Record<string, unknown> = Record<string, never>,
>(spec: { schema: TSchema; methods?: TExtra }): Model<TSchema, TExtra> {
  return {
    schema: spec.schema,
    parse: (value: unknown) => spec.schema.parse(value),
    validate: (
      value: unknown,
      toError: (message: string, cause: z.ZodError) => Error = (message, cause) =>
        new Error(message, { cause }),
    ) => tryValidate(spec.schema as z.ZodType<z.infer<TSchema>>, value, toError),
    ...(spec.methods as TExtra),
  }
}
