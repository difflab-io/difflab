import type { ResolvedThemeMode, ThemePreference, ThemeServiceOptions } from './types.js'

// Constants -------------------------------------------------------------------
const DEFAULT_STORAGE_KEY = 'difflab.theme'

// API -------------------------------------------------------------------------
export class ThemeService {
  preference = $state<ThemePreference>('dark')
  systemDark = $state(readSystemDarkMode())

  private readonly storageKey: string
  private readonly themeClass: string | undefined
  private readonly defaultPreference: ThemePreference

  constructor(options: ThemeServiceOptions = {}) {
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
    this.themeClass = options.themeClass
    this.defaultPreference = options.defaultPreference ?? 'dark'
    this.preference = this.defaultPreference
  }

  readonly resolvedMode = $derived<ResolvedThemeMode>(
    this.preference === 'system' ? (this.systemDark ? 'dark' : 'light') : this.preference,
  )
  readonly isDark = $derived(this.resolvedMode === 'dark')

  init(): () => void {
    if (typeof window === 'undefined') return () => {}

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    this.systemDark = mediaQuery.matches

    const stored = window.localStorage.getItem(this.storageKey)
    if (stored === 'system' || stored === 'light' || stored === 'dark') {
      this.preference = stored
    } else {
      this.preference = this.defaultPreference
    }
    this.applyToDocument()

    const handleMediaChange = (event: MediaQueryListEvent) => {
      this.systemDark = event.matches
      this.applyToDocument()
    }

    mediaQuery.addEventListener('change', handleMediaChange)
    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange)
    }
  }

  setPreference(next: ThemePreference): void {
    this.preference = next
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.storageKey, next)
    }
    this.applyToDocument()
  }

  private applyToDocument(): void {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (this.themeClass) {
      root.classList.add(this.themeClass)
    }
    root.classList.toggle('dark', this.resolvedMode === 'dark')
    root.style.colorScheme = this.resolvedMode
  }
}

// Helpers ---------------------------------------------------------------------
function readSystemDarkMode(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return true
  }
}
