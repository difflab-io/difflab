import { createHash, timingSafeEqual } from 'node:crypto'
import { Code, ConnectError, createContextKey, type HandlerContext } from '@connectrpc/connect'
import type { ApiMode } from 'difflab-config'
import { DEFAULT_ACTOR, type ActorContext } from 'difflab-db'

// Constants -------------------------------------------------------------------
const kActor = createContextKey<ActorContext | null>(null)

// Types -----------------------------------------------------------------------
export type AuthServiceOptions = {
  mode: ApiMode
  apiToken?: string
}

export type AuthService = {
  readonly mode: ApiMode
  authenticate: (headers: Headers) => ActorContext
  resolveActor: (context: HandlerContext) => ActorContext
  requestGate: (context: HandlerContext) => void
}

// API -------------------------------------------------------------------------
export function createAuthService(options: AuthServiceOptions): AuthService {
  const expectedToken = options.apiToken?.trim()
  if (options.mode === 'cloud' && !expectedToken) {
    throw new Error('DIFFLAB_API_TOKEN must be configured when running difflab-api in cloud mode')
  }
  const expectedDigest = expectedToken ? sha256(expectedToken) : null

  const authenticate = (headers: Headers): ActorContext => {
    if (options.mode === 'local') {
      return DEFAULT_ACTOR
    }

    const presentedToken = extractBearerToken(headers.get('authorization'))
    if (!presentedToken || !expectedDigest || !tokensMatch(presentedToken, expectedDigest)) {
      throw new ConnectError('Missing or invalid Bearer token', Code.Unauthenticated)
    }

    const workspaceId = headers.get('x-difflab-workspace')?.trim()
    if (!workspaceId) {
      throw new ConnectError('Missing required x-difflab-workspace header', Code.InvalidArgument)
    }

    return {
      workspaceId,
      userId: null,
    }
  }

  return {
    mode: options.mode,
    authenticate,
    resolveActor(context: HandlerContext): ActorContext {
      return context.values.get(kActor) ?? authenticate(context.requestHeader)
    },
    requestGate(context: HandlerContext): void {
      context.values.set(kActor, authenticate(context.requestHeader))
    },
  }
}

// Helpers ---------------------------------------------------------------------
function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null
  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim())
  return match?.[1] ?? null
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function tokensMatch(presentedToken: string, expectedDigest: Buffer): boolean {
  const presentedDigest = sha256(presentedToken)
  return timingSafeEqual(presentedDigest, expectedDigest)
}
