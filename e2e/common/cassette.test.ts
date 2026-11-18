import { describe, expect, it } from 'vitest'
import { CassetteReplay, type Cassette } from './cassette.js'

// Setup -----------------------------------------------------------------------
const SAMPLE_CASSETTE: Cassette = {
  version: 1,
  fixture: { name: 'linear-ready-test' },
  responses: [
    {
      status: 200,
      body: {
        data: {
          issues: {
            nodes: [{ id: '11111111-1111-4111-8111-111111111111', identifier: 'ENG-42' }],
          },
        },
      },
    },
    {
      status: 200,
      body: { data: { issueUpdate: { success: true } } },
    },
  ],
  exchanges: [
    {
      request: {
        method: 'POST',
        path: '/graphql',
        body: {
          query: 'query ReadyIssues { issues { nodes { id identifier } } }',
          variables: {},
        },
      },
      response: 0,
    },
    {
      request: {
        method: 'POST',
        path: '/graphql',
        body: {
          query: 'mutation AckIssue($id: String!) { issueUpdate(id: $id) { success } }',
          variables: { id: '11111111-1111-4111-8111-111111111111' },
        },
      },
      response: 1,
    },
  ],
}

// Tests -----------------------------------------------------------------------
describe('Given recorded Linear GraphQL exchanges', () => {
  describe('When replaying queries and mutations offline', () => {
    it('should replay repeated reads, bind runtime UUIDs across write barriers, and reject unrecorded requests', () => {
      // Arrange
      const replay = new CassetteReplay(SAMPLE_CASSETTE)
      const runtimeUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

      // Act
      const firstRead = replay.respond({
        method: 'POST',
        path: '/graphql',
        body: {
          query: 'query   ReadyIssues {\n  issues { nodes { id identifier } }\n}',
          variables: {},
        },
      })
      const secondRead = replay.respond({
        method: 'POST',
        path: '/graphql',
        body: {
          query: 'query ReadyIssues { issues { nodes { id identifier } } }',
          variables: {},
        },
      })
      const mutation = replay.respond({
        method: 'POST',
        path: '/graphql',
        body: {
          query: 'mutation AckIssue($id: String!) { issueUpdate(id: $id) { success } }',
          variables: { id: runtimeUuid },
        },
      })

      // Assert
      expect(firstRead.status).toBe(200)
      expect(secondRead.status).toBe(200)
      expect(mutation.status).toBe(200)
      expect(() => replay.verify()).not.toThrow()
      expect(() =>
        replay.respond({
          method: 'POST',
          path: '/graphql',
          body: { query: 'query Unrecorded { viewer { id } }', variables: {} },
        }),
      ).toThrow(/Unrecorded cassette request/)
    })
  })
})
