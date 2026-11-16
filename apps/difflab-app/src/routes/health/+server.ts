import { json, type RequestHandler } from '@sveltejs/kit'

// API -------------------------------------------------------------------------
export const GET: RequestHandler = async () => {
  return json({ ok: true })
}
