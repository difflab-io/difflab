import { afterEach, describe, expect, it } from 'bun:test'
import app from './app.js'

// Setup -----------------------------------------------------------------------
const servers: ReturnType<typeof Bun.serve>[] = []

// Tests -----------------------------------------------------------------------
describe('difflab-flow-engine', () => {
  describe('given health and Linear Ready polling endpoints', () => {
    it('reports ok on GET /health', async () => {
      // Arrange
      const request = new Request('http://localhost/health')

      // Act
      const response = await app.fetch(request)

      // Assert
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, service: 'difflab-flow-engine' })
    })

    it('polls Linear Ready issues and forwards normalized candidates to difflab-app', async () => {
      // Arrange
      const forwardedBodies: unknown[] = []
      const mockLinear = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch() {
          return Response.json({
            data: {
              issues: {
                nodes: [
                  {
                    id: 'issue-42',
                    identifier: 'ENG-42',
                    title: 'Implement loops MVP',
                    description: 'Wire orchestrator and daemon.',
                    state: { name: 'Ready' },
                    team: { key: 'ENG' },
                    assignee: { name: 'difflab', displayName: 'difflab' },
                    labels: { nodes: [{ name: 'COMP:difflab' }] },
                  },
                ],
              },
            },
          })
        },
      })
      servers.push(mockLinear)

      const mockApp = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        async fetch(req) {
          forwardedBodies.push(await req.json())
          return Response.json({
            results: [
              {
                identifier: 'ENG-42',
                outcomes: [{ matched: true, runId: '261116-autospec-abcd' }],
              },
            ],
          })
        },
      })
      servers.push(mockApp)

      // Act
      const response = await app.fetch(
        new Request('http://localhost/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linearApiUrl: `http://127.0.0.1:${mockLinear.port}/graphql`,
            linearApiKey: 'lin_test_token',
            appUrl: `http://127.0.0.1:${mockApp.port}`,
          }),
        }),
      )
      const json = (await response.json()) as { ok: boolean; polled: number }

      // Assert
      expect(response.status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.polled).toBe(1)
      expect(forwardedBodies).toEqual([
        {
          issues: [
            {
              id: 'issue-42',
              identifier: 'ENG-42',
              title: 'Implement loops MVP',
              description: 'Wire orchestrator and daemon.',
              state: 'Ready',
              team: 'ENG',
              agent: 'difflab',
              assignee: 'difflab',
              labels: ['COMP:difflab'],
            },
          ],
        },
      ])
    })
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(() => {
  for (const srv of servers.splice(0)) {
    srv.stop(true)
  }
})
