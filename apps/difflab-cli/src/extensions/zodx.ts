import { isAbsolute } from 'node:path'
import { z } from 'zod'

// API -------------------------------------------------------------------------
export const absolutePath = z.string().refine(isAbsolute, 'path must be absolute')

export const relativePath = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0 && !isAbsolute(value), 'path must be relative')

export const fileName = z
  .string()
  .refine(
    (value) => value.trim().length > 0 && value !== '.' && value !== '..' && !/[/\\\0]/.test(value),
    'filename must be a single non-empty file name',
  )
