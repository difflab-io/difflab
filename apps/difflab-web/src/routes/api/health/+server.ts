import { json } from '@sveltejs/kit'
import {
  API_VERSION,
  LATEST_CLIENT_VERSION,
  MIN_CLIENT_VERSION,
  SUPPORTED_API_VERSIONS,
} from '$lib/server/runtime.js'
import type { RequestHandler } from './$types.js'

// API -------------------------------------------------------------------------
export const GET: RequestHandler = async ({ locals }) => {
  const session = locals.session
  return json(
    {
      ok: true,
      mode: locals.mode,
      authProvider: locals.authProvider,
      apiVersion: API_VERSION,
      supportedApiVersions: SUPPORTED_API_VERSIONS,
      minClientVersion: MIN_CLIENT_VERSION,
      latestClientVersion: LATEST_CLIENT_VERSION,
      auth: {
        authenticated: session !== null,
        user: session
          ? {
              id: session.userId,
              email: session.email ?? null,
              name: session.name ?? null,
              workspaceId: session.workspaceId,
              via: session.via,
            }
          : null,
      },
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  )
}
