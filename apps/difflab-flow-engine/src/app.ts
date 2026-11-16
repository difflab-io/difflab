import { Hono } from 'hono'
import { z } from 'zod'
import { pollLinearReadyIssues } from './linear-poller.js'

// Constants -------------------------------------------------------------------
const pollBodySchema = z
  .object({
    linearApiUrl: z.string().url().optional(),
    linearApiKey: z.string().optional(),
    appUrl: z.string().url().optional(),
  })
  .optional()

const app = new Hono()

// API -------------------------------------------------------------------------
app.get('/health', (c) => {
  return c.json({ ok: true, service: 'difflab-flow-engine' })
})

app.post('/poll', async (c) => {
  const rawText = await c.req.text()
  let parsedBody: z.infer<typeof pollBodySchema>
  if (rawText.trim()) {
    try {
      parsedBody = pollBodySchema.parse(JSON.parse(rawText))
    } catch (error) {
      return c.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        400,
      )
    }
  }

  try {
    const outcome = await pollLinearReadyIssues(parsedBody ?? {})
    return c.json({ ok: true, ...outcome })
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502)
  }
})

export default app
