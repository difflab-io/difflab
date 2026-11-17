// Types -----------------------------------------------------------------------
export type ComponentTaxonomyKind = 'App' | 'Library'

export interface RepoComponentNode {
  name: string
  kind: ComponentTaxonomyKind
  path: string
  template?: string
}

export interface RepositoryGraphRow {
  id: string
  slug: string
  shortName: string
  url: string
  localPath?: string | null
  components: RepoComponentNode[]
}

export interface RepoComponentGraphProps {
  repositories: RepositoryGraphRow[]
  class?: string
}
