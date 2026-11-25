import type { VariantProps } from 'class-variance-authority'
import type { authCardVariants } from './styles.js'

// Types -----------------------------------------------------------------------
/** Displayable identity snapshot for the authenticated Difflab user. */
export type AuthCardUser = {
  readonly id?: string | null
  readonly email?: string | null
  readonly name?: string | null
  readonly workspaceId: string
  readonly via: 'loopback' | 'bearer' | 'session'
}

/** Props for `AuthCard`, following helical-ui orthogonal variant conventions. */
export interface AuthCardProps extends VariantProps<typeof authCardVariants> {
  readonly mode: 'local' | 'cloud'
  readonly authProvider: 'local' | 'token' | 'oidc'
  readonly authenticated: boolean
  readonly user?: AuthCardUser | null
  readonly loginHref?: string
  readonly logoutHref?: string
  readonly errorMessage?: string | null
  readonly class?: string
}
