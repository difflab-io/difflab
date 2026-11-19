import { z } from 'zod'
import { ProjectValidationError } from '../errors.js'

// Constants -------------------------------------------------------------------
export const projectKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{2,15}$/, 'Project key must be 3-16 uppercase letters or digits')

export const workspaceIdSchema = z
  .string()
  .min(1, 'Workspace ID must be nonempty and at most 64 characters')
  .max(64, 'Workspace ID must be nonempty and at most 64 characters')

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member'])

export const isoTimestampSchema = z.string().min(1)

// API -------------------------------------------------------------------------
export function validateProjectKey(key: string): string {
  const normalized = key.trim().toUpperCase()
  const parsed = projectKeySchema.safeParse(normalized)
  if (!parsed.success) {
    throw new ProjectValidationError('Project key must be 3-16 uppercase letters or digits')
  }
  return parsed.data
}

export function validateWorkspaceId(workspaceId: string): string {
  const trimmed = workspaceId.trim()
  const parsed = workspaceIdSchema.safeParse(trimmed)
  if (!parsed.success) {
    throw new ProjectValidationError('Workspace ID must be nonempty and at most 64 characters')
  }
  return parsed.data
}
