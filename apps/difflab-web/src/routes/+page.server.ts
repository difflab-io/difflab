import type { PageServerLoad } from './$types.js'

// API -------------------------------------------------------------------------
export const load: PageServerLoad = async ({ locals, url }) => {
  return {
    mode: locals.mode,
    authProvider: locals.authProvider,
    authenticated: locals.session !== null,
    user: locals.session
      ? {
          id: locals.session.userId,
          email: locals.session.email ?? null,
          name: locals.session.name ?? null,
          workspaceId: locals.session.workspaceId,
          via: locals.session.via,
        }
      : null,
    errorMessage: url.searchParams.get('error'),
  }
}
