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

export type DatabaseConfig =
  { dialect: 'sqlite'; path: string } | { dialect: 'postgres'; connectionString: string }
