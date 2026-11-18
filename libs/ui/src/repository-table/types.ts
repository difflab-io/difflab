// Types -----------------------------------------------------------------------
export interface RepositoryRow {
  id: string
  slug: string
  shortName: string
  url: string
  localPath?: string | null
}

export interface RepositoryTableProps {
  repositories: RepositoryRow[]
  class?: string
}
