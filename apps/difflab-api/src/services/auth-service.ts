import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, timingSafeEqual } from 'node:crypto'
import { Code, ConnectError, createContextKey, type HandlerContext } from '@connectrpc/connect'
import type { ApiMode } from 'difflab-config'
import { DEFAULT_ACTOR, type ActorContext } from 'difflab-db'
import { annotateWideEvent } from 'utils/logx'

// Constants -------------------------------------------------------------------
const kActor = createContextKey<ActorContext | null>(null)
const requestAuthStorage = new AsyncLocalStorage<{ actor: ActorContext | null }>()

// Types -----------------------------------------------------------------------
export type AuthServiceOptions = {
  mode: ApiMode
  apiToken?: string
}

// API -------------------------------------------------------------------------
export class AuthService {
  readonly mode: ApiMode
  private readonly expectedDigest: Buffer | null

  constructor(options: AuthServiceOptions) {
    this.mode = options.mode
    const expectedToken = options.apiToken?.trim()
    if (options.mode === 'cloud' && !expectedToken) {
      throw new Error('DIFFLAB_API_TOKEN must be configured when running difflab-api in cloud mode')
    }
    this.expectedDigest = expectedToken ? sha256(expectedToken) : null
  }

  static withOptions(options: AuthServiceOptions): AuthService {
    return new AuthService(options)
  }

  get currentActor(): ActorContext | null {
    return requestAuthStorage.getStore()?.actor ?? null
  }

  runRequestScope<T>(fn: () => Promise<T>): Promise<T> {
    return requestAuthStorage.run({ actor: null }, fn)
  }

  authenticate = (headers: Headers): ActorContext => {
    if (this.mode === 'local') {
      return DEFAULT_ACTOR
    }

    const presentedToken = extractBearerToken(headers.get('authorization'))
    if (
      !presentedToken ||
      !this.expectedDigest ||
      !tokensMatch(presentedToken, this.expectedDigest)
    ) {
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

  requestGate = (context: HandlerContext): void => {
    const actor = this.authenticate(context.requestHeader)
    const scope = requestAuthStorage.getStore()
    if (scope) {
      scope.actor = actor
    }
    context.values.set(kActor, actor)
    annotateWideEvent({
      workspace: actor.workspaceId,
      user_id: actor.userId,
    })
  }

  requireActor(context?: HandlerContext): ActorContext {
    const actor =
      this.currentActor ??
      (context ? (context.values.get(kActor) ?? this.authenticate(context.requestHeader)) : null)
    if (!actor) {
      throw new ConnectError('Missing authenticated request context', Code.Unauthenticated)
    }
    return actor
  }
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  return AuthService.withOptions(options)
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
