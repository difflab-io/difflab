import { json } from '@sveltejs/kit'
import { DifflabWebAuthError } from '$lib/server/auth/index.js'
import { getWebRuntime } from '$lib/server/runtime.js'
import type { RequestHandler } from './$types.js'

// API -------------------------------------------------------------------------
export const GET: RequestHandler = async ({ request }) => {
  const { authProvider } = getWebRuntime()
  if (!authProvider.beginLogin) {
    return json(
      { error: `Login is not supported for auth provider "${authProvider.kind}"` },
      { status: 400 },
    )
  }
  try {
    return await authProvider.beginLogin(request)
  } catch (error) {
    if (error instanceof DifflabWebAuthError) {
      return json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
