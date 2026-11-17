// Types -----------------------------------------------------------------------
export type ComponentTaxonomyKind = 'App' | 'Library'

export interface RepoComponentNode {
  name: string
  kind: ComponentTaxonomyKind
  path: string
  template?: string
  hasDocs?: boolean
}

export interface RepositoryGraphRow {
  id: string
  slug: string
  shortName: string
  url: string
  localPath?: string | null
  docCount: number
  components: RepoComponentNode[]
}

export interface RepoComponentGraphProps {
  repositories: RepositoryGraphRow[]
  onOpenDocs?: (repoId: string, componentName?: string) => void
  class?: string
}
