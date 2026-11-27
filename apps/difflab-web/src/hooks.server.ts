import { building } from '$app/environment'
import type { Handle } from '@sveltejs/kit'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { annotateWideEvent, runWithWideEvent } from 'utils/logx'
import { DifflabWebAuthError } from './errors.js'
import {
  API_VERSION,
  getWebRuntime,
  LATEST_CLIENT_VERSION,
  MIN_CLIENT_VERSION,
  SUPPORTED_API_VERSIONS,
  webLogger,
} from '$lib/server/runtime.js'

// API -------------------------------------------------------------------------
export const handle: Handle = async ({ event, resolve }) => {
  const runtime = getWebRuntime()
  event.locals.mode = runtime.config.mode
  event.locals.authProvider = runtime.config.authProvider
  event.locals.session = null

  const isApiPath = event.url.pathname.startsWith('/api/')
  if (isApiPath) {
    const requestedApiVersion = event.request.headers.get('x-difflab-api-version')?.trim()
    if (
      requestedApiVersion &&
      !(SUPPORTED_API_VERSIONS as readonly string[]).includes(requestedApiVersion)
    ) {
      return upgradeRequiredResponse(`Unsupported API version: ${requestedApiVersion}`)
    }
    const clientVersion = event.request.headers.get('x-difflab-client-version')?.trim()
    if (clientVersion && compareSemver(clientVersion, MIN_CLIENT_VERSION) < 0) {
      return upgradeRequiredResponse(
        `Client version ${clientVersion} is below minimum supported ${MIN_CLIENT_VERSION}`,
      )
    }
  }

  return await runWithWideEvent(
    webLogger,
    'difflab-web.request',
    {
      method: event.request.method,
      path: event.url.pathname,
      mode: runtime.config.mode,
      auth_provider: runtime.config.authProvider,
    },
    async () => {
      try {
        event.locals.session = await runtime.authProvider.resolveRequest(event.request)
      } catch (error) {
        if (error instanceof DifflabWebAuthError) {
          annotateWideEvent({ status: error.status, error: error.message })
          return Response.json({ error: error.message }, { status: error.status })
        }
        throw error
      }

      const response = runtime.authProvider.betterAuth
        ? await svelteKitHandler({
            event,
            resolve,
            auth: runtime.authProvider.betterAuth,
            building,
          })
        : await resolve(event)
      if (isApiPath) {
        response.headers.set('x-difflab-api-version', API_VERSION)
        response.headers.set('x-difflab-latest-client-version', LATEST_CLIENT_VERSION)
      }
      annotateWideEvent({
        status: response.status,
        authenticated: event.locals.session !== null,
      })
      return response
    },
  )
}

// Helpers ---------------------------------------------------------------------
function upgradeRequiredResponse(message: string): Response {
  return Response.json(
    {
      code: 'UPGRADE_REQUIRED',
      message,
      minClientVersion: MIN_CLIENT_VERSION,
      supportedApiVersions: SUPPORTED_API_VERSIONS,
      upgradeCommand: 'npm install -g @difflab/difflab-cli@latest',
    },
    {
      status: 426,
      headers: {
        'x-difflab-api-version': API_VERSION,
        'x-difflab-latest-client-version': LATEST_CLIENT_VERSION,
      },
    },
  )
}

function compareSemver(a: string, b: string): number {
  const partsA = a
    .replace(/^v/, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  const partsB = b
    .replace(/^v/, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
