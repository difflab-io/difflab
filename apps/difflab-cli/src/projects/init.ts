import { initializeRepository as initialize } from './repo-store.js'

// Types -----------------------------------------------------------------------
export type InitOptions = { cwd: string; home?: string; projectId: string }

// API -------------------------------------------------------------------------
export function initializeRepository(options: InitOptions) {
  return initialize(options.cwd, options.projectId, options.home)
}
