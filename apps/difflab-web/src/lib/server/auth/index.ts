// API -------------------------------------------------------------------------
export { createOidcAuthProvider, type OidcAuthProviderOptions } from './oidc.js'
export { createAuthProvider } from './provider.js'
export {
  formatCookie,
  OIDC_TX_COOKIE_NAME,
  readCookie,
  sealOidcTransaction,
  sealSession,
  SESSION_COOKIE_NAME,
  unsealOidcTransaction,
  unsealSession,
  type OidcTransaction,
} from './session.js'
export { DifflabWebAuthError, type AuthenticatedSession, type AuthProvider } from './types.js'
