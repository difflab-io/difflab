import type { GitRemoteRow } from './git-remote.js'
import type { ProjectRow } from './project.js'
import type { User } from './user.js'
import type { Workspace, WorkspaceMember } from './workspace.js'

// Types -----------------------------------------------------------------------
/** Kysely table map for shared tables present on both SQLite and PostgreSQL. */
export type CoreDatabase = {
  projects: ProjectRow
  git_remotes: GitRemoteRow
}

/** Kysely table map for cloud-only tenancy tables present on PostgreSQL. */
export type CloudDatabase = {
  workspaces: Workspace
  users: User
  workspace_members: WorkspaceMember
}

/** Complete Kysely table map across shared and cloud-only tables. */
export type DifflabDatabase = CoreDatabase & CloudDatabase

// API -------------------------------------------------------------------------
export { defineEntity, type Entity } from 'utils/entity'
export {
  DEFAULT_ACTOR,
  isoTimestampSchema,
  LOCAL_WORKSPACE_ID,
  projectKeySchema,
  validateProjectKey,
  validateWorkspaceId,
  workspaceIdSchema,
  workspaceRoleSchema,
  type ActorContext,
} from './common.js'
export {
  GitRemoteEntity,
  gitRemoteRowSchema,
  gitRemoteSchema,
  type GitRemote,
  type GitRemoteRow,
} from './git-remote.js'
export {
  ProjectEntity,
  projectRowSchema,
  projectSchema,
  type Project,
  type ProjectRow,
} from './project.js'
export { UserEntity, userSchema, type User } from './user.js'
export {
  WorkspaceEntity,
  WorkspaceMemberEntity,
  workspaceMemberSchema,
  workspaceSchema,
  workspaceSlugSchema,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole,
} from './workspace.js'
