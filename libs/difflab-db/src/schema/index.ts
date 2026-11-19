import type { GitRemoteRow } from './git-remote.js'
import type { ProjectRow } from './project.js'
import type { UserRow } from './user.js'
import type { WorkspaceMemberRow, WorkspaceRow } from './workspace.js'

// Types -----------------------------------------------------------------------
export interface CoreDatabase {
  projects: ProjectRow
  git_remotes: GitRemoteRow
}

export interface CloudDatabase {
  workspaces: WorkspaceRow
  users: UserRow
  workspace_members: WorkspaceMemberRow
}

export type DifflabDatabase = CoreDatabase & CloudDatabase

// API -------------------------------------------------------------------------
export {
  isoTimestampSchema,
  projectKeySchema,
  validateProjectKey,
  validateWorkspaceId,
  workspaceIdSchema,
  workspaceRoleSchema,
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
  type WorkspaceRow,
} from './workspace.js'
