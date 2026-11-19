// Types -----------------------------------------------------------------------
export type ApiMode = 'local' | 'cloud'

export type DifflabPaths = {
  root: string
  projects: string
  templates: string
  database: string
  legacyDatabase: string
  daemonLog: string
}

export type RemoteClientEnv = {
  rpcUrl: string
  token?: string
  workspaceId?: string
}

export type RepoConfig = {
  schemaVersion: 1
  project: {
    id: string
  }
}
