// Types -----------------------------------------------------------------------
export type DifflabAppId = 'home' | 'wikis' | 'tasks' | 'plans' | 'reviews' | 'flows'

export interface AppRailItem {
  id: DifflabAppId
  label: string
  badge?: number
  live?: boolean
}

export interface AppRailProps {
  activeApp: DifflabAppId
  items: AppRailItem[]
  onselect: (app: DifflabAppId) => void
  class?: string
}
