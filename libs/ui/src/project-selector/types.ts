// Types -----------------------------------------------------------------------
export interface ProjectSelectorOption {
  id: string
  name: string
  repoCount: number
  flowCount?: number
}

export interface ProjectSelectorProps {
  projects: ProjectSelectorOption[]
  selectedId: string | null
  onchange: (projectId: string) => void
  class?: string
}
