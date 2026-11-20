import type { GitRemoteRow } from './git-remote.js'
import type { ProjectRow } from './project.js'
import type { UserRow } from './user.js'
import type { WorkspaceMemberRow, WorkspaceRow } from './workspace.js'

// Types -----------------------------------------------------------------------
/** Kysely table map for shared tables present on both SQLite and PostgreSQL. */
export type CoreDatabase = {
  projects: ProjectRow
  git_remotes: GitRemoteRow
}

/** Kysely table map for cloud-only tenancy tables present on PostgreSQL. */
export type CloudDatabase = {
  workspaces: WorkspaceRow
  users: UserRow
  workspace_members: WorkspaceMemberRow
}

/** Complete Kysely table map across shared and cloud-only tables. */
export type DifflabDatabase = CoreDatabase & CloudDatabase

// API -------------------------------------------------------------------------
export {
  DEFAULT_ACTOR,
  defineEntity,
  isoTimestampSchema,
  LOCAL_WORKSPACE_ID,
  projectKeySchema,
  validateProjectKey,
  validateWorkspaceId,
  workspaceIdSchema,
  workspaceRoleSchema,
  type ActorContext,
  type Entity,
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
export { UserEntity, userRowSchema, userSchema, type User, type UserRow } from './user.js'
export {
  WorkspaceEntity,
  WorkspaceMemberEntity,
  workspaceMemberRowSchema,
  workspaceMemberSchema,
  workspaceRowSchema,
  workspaceSchema,
  workspaceSlugSchema,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceMemberRow,
  type WorkspaceRole,
  type WorkspaceRow,
} from './workspace.js'
