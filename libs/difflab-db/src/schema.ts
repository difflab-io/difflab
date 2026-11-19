// Constants -------------------------------------------------------------------
export const LOCAL_WORKSPACE_ID = 'local'

export const DEFAULT_ACTOR: ActorContext = {
  workspaceId: LOCAL_WORKSPACE_ID,
  userId: null,
}

// Types -----------------------------------------------------------------------
export type MigrationType = 'shared' | 'cloud'

export type WorkspaceRole = 'owner' | 'admin' | 'member'

export type ActorContext = {
  workspaceId: string
  userId: string | null
}

export interface ProjectsTable {
  id: string
  workspace_id: string
  key: string
  name: string
  created_by_user_id: string | null
  created_at: string
}

export interface RepositoriesTable {
  id: string
  workspace_id: string
  project_id: string
  project_key: string
  github_url: string
  slug: string
  created_by_user_id: string | null
  created_at: string
}

export interface WorkspacesTable {
  id: string
  slug: string
  name: string
  created_at: string
}

export interface UsersTable {
  id: string
  email: string
  display_name: string
  created_at: string
}

export interface WorkspaceMembersTable {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  created_at: string
}

export interface CoreDatabase {
  projects: ProjectsTable
  repositories: RepositoriesTable
}

export interface CloudDatabase {
  workspaces: WorkspacesTable
  users: UsersTable
  workspace_members: WorkspaceMembersTable
}

export type DifflabDatabase = CoreDatabase & CloudDatabase

export type Repository = {
  id: string
  projectId: string
  url: string
  slug: string
  createdAt: string
}

export type Project = {
  id: string
  name: string
  workspaceId: string
  createdByUserId: string | null
  createdAt: string
  repositories: Repository[]
}

export type Workspace = {
  id: string
  slug: string
  name: string
  createdAt: string
}

export type User = {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export type WorkspaceMember = {
  workspaceId: string
  userId: string
  role: WorkspaceRole
  createdAt: string
}
