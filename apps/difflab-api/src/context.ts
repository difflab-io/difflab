import { createHash, timingSafeEqual } from 'node:crypto'
import { Code, ConnectError, createContextKey, type HandlerContext } from '@connectrpc/connect'
import type { ActorContext } from 'difflab-db'

// Constants -------------------------------------------------------------------
export const LOCAL_ACTOR: ActorContext = {
  workspaceId: 'local',
  userId: null,
}

export const kActor = createContextKey<ActorContext>(LOCAL_ACTOR)

// Types -----------------------------------------------------------------------
export type ApiMode = 'local' | 'cloud'

export type AuthGateOptions = {
  mode: ApiMode
  apiToken?: string
}

// API -------------------------------------------------------------------------
export function createAuthRequestGate(options: AuthGateOptions): (context: HandlerContext) => void {
  const expectedToken = options.apiToken?.trim()
  if (options.mode === 'cloud' && !expectedToken) {
    throw new Error('DIFFLAB_API_TOKEN must be configured when running difflab-api in cloud mode')
  }
  const expectedDigest = expectedToken ? sha256(expectedToken) : null

  return (context: HandlerContext): void => {
    if (options.mode === 'local') {
      context.values.set(kActor, LOCAL_ACTOR)
      return
    }

    const presentedToken = extractBearerToken(context.requestHeader.get('authorization'))
    if (!presentedToken || !expectedDigest || !tokensMatch(presentedToken, expectedDigest)) {
      throw new ConnectError('Missing or invalid Bearer token', Code.Unauthenticated)
    }

    const workspaceId = context.requestHeader.get('x-difflab-workspace')?.trim()
    if (!workspaceId) {
      throw new ConnectError('Missing required x-difflab-workspace header', Code.InvalidArgument)
    }

    context.values.set(kActor, {
      workspaceId,
      userId: null,
    })
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
