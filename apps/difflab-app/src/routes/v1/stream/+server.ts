import type { RequestHandler } from '@sveltejs/kit'
import { subscribeFlowEvents } from '$lib/server/hub.js'

// API -------------------------------------------------------------------------
export const GET: RequestHandler = async ({ request, url }) => {
  const runId = url.searchParams.get('runId') ?? undefined
  const encoder = new TextEncoder()
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'))
      const unsubscribe = subscribeFlowEvents((event) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          )
        } catch {
          unsubscribe()
        }
      }, runId)

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 15_000)

      cleanup = () => {
        clearInterval(heartbeat)
        unsubscribe()
      }

      request.signal.addEventListener('abort', () => {
        cleanup?.()
        try {
          controller.close()
        } catch {
          // Stream already closed.
        }
      })
    },
    cancel() {
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
