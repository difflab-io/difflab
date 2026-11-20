import type { GitRemote } from './git-remote.js'
import type { Project } from './project.js'
import type { User } from './user.js'
import type { Workspace, WorkspaceMember } from './workspace.js'

// Types -----------------------------------------------------------------------
/** Kysely table map for shared tables present on both SQLite and PostgreSQL. */
export type CoreDatabase = {
  projects: Project
  git_remotes: GitRemote
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
export { defineModel, type Model } from 'utils/model'
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
export { GitRemoteModel, gitRemoteSchema, type GitRemote } from './git-remote.js'
export { ProjectModel, projectSchema, type Project, type ProjectWithRemotes } from './project.js'
export { UserModel, userSchema, type User } from './user.js'
export {
  WorkspaceMemberModel,
  WorkspaceModel,
  workspaceMemberSchema,
  workspaceSchema,
  workspaceSlugSchema,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole,
} from './workspace.js'
