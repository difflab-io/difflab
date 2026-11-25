import { json } from '@sveltejs/kit'
import { getWebRuntime } from '$lib/server/runtime.js'
import type { RequestHandler } from './$types.js'

// API -------------------------------------------------------------------------
const handleLogout: RequestHandler = async ({ request }) => {
  const { authProvider } = getWebRuntime()
  if (!authProvider.logout) {
    return json(
      { error: `Logout is not supported for auth provider "${authProvider.kind}"` },
      { status: 400 },
    )
  }
  return await authProvider.logout(request)
}

export const GET = handleLogout
export const POST = handleLogout
