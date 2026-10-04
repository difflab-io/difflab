// Types -----------------------------------------------------------------------
export interface ProjectRow {
  key: string
  name: string
}

export interface RepositoryRow {
  id: string
  project_key: string
  github_url: string
  slug: string
}

export interface ProjectDatabase {
  projects: ProjectRow
  repositories: RepositoryRow
}
