// Types -----------------------------------------------------------------------
export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedThemeMode = 'light' | 'dark'

export interface ThemeServiceOptions {
  storageKey?: string
  themeClass?: string
  defaultPreference?: ThemePreference
}

export interface ThemeToggleProps {
  value: ThemePreference
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'outline'
  class?: string
  onchange: (value: ThemePreference) => void
}
