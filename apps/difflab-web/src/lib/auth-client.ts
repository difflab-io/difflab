import { createAuthClient } from 'better-auth/svelte'

// API -------------------------------------------------------------------------
/** Browser Better Auth client for OIDC sign-in and sign-out. */
export const authClient = createAuthClient()
