import type { ApiMode, AuthProviderKind } from 'difflab-config'
import type { AuthenticatedSession } from '$lib/server/auth/index.js'

declare global {
  namespace App {
    interface Locals {
      mode: ApiMode
      authProvider: AuthProviderKind
      session: AuthenticatedSession | null
    }
  }
}

export {}
