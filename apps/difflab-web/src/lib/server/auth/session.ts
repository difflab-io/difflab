import { createHash } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import type { AuthenticatedSession } from './types.js'

// Constants -------------------------------------------------------------------
export const SESSION_COOKIE_NAME = 'difflab_session'
export const OIDC_TX_COOKIE_NAME = 'difflab_oidc_tx'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const TX_TTL_SECONDS = 60 * 10

// Types -----------------------------------------------------------------------
/** Short-lived PKCE transaction state stored in an encrypted HttpOnly cookie. */
export type OidcTransaction = {
  readonly state: string
  readonly codeVerifier: string
  readonly nonce: string
  readonly returnTo: string
}

// API -------------------------------------------------------------------------
/** Seal an `AuthenticatedSession` into a JWE cookie value using `sessionSecret`. */
export async function sealSession(
  session: AuthenticatedSession,
  sessionSecret: string,
): Promise<string> {
  return await new EncryptJWT({ session })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .encrypt(deriveKey(sessionSecret))
}

/** Decrypt and validate a sealed session cookie, returning `null` if invalid or expired. */
export async function unsealSession(
  token: string,
  sessionSecret: string,
): Promise<AuthenticatedSession | null> {
  try {
    const { payload } = await jwtDecrypt(token, deriveKey(sessionSecret))
    const session = payload.session as AuthenticatedSession | undefined
    if (!session || typeof session.workspaceId !== 'string') return null
    return session
  } catch {
    return null
  }
}

/** Seal a short-lived OIDC PKCE transaction into a JWE cookie value. */
export async function sealOidcTransaction(
  tx: OidcTransaction,
  sessionSecret: string,
): Promise<string> {
  return await new EncryptJWT({ tx })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${TX_TTL_SECONDS}s`)
    .encrypt(deriveKey(sessionSecret))
}

/** Decrypt a short-lived OIDC PKCE transaction cookie, returning `null` if invalid. */
export async function unsealOidcTransaction(
  token: string,
  sessionSecret: string,
): Promise<OidcTransaction | null> {
  try {
    const { payload } = await jwtDecrypt(token, deriveKey(sessionSecret))
    const tx = payload.tx as OidcTransaction | undefined
    if (!tx || typeof tx.state !== 'string' || typeof tx.codeVerifier !== 'string') return null
    return tx
  } catch {
    return null
  }
}

/** Parse a named cookie from a `Cookie` request header. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

/** Build a `Set-Cookie` header string for an HttpOnly cookie. */
export function formatCookie(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAge}`,
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

// Helpers ---------------------------------------------------------------------
function deriveKey(secret: string): Uint8Array {
  return createHash('sha256').update(secret).digest()
}
