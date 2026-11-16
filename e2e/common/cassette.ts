import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'

// Constants -------------------------------------------------------------------
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

// Types -----------------------------------------------------------------------
export type JsonObject = Record<string, unknown>

export type Exchange = {
  request: {
    method: string
    path: string
    body: JsonObject | null
  }
  response: {
    status: number
    headers?: Record<string, string>
    body: JsonObject | unknown[] | null
  }
}

export type Cassette = {
  version: 1
  fixture: { name: string; run?: string }
  responses: Exchange['response'][]
  exchanges: { request: Exchange['request']; response: number }[]
}

// API -------------------------------------------------------------------------
export function isReadExchange(request: Exchange['request']): boolean {
  if (request.method === 'GET') return true
  if (request.path === '/graphql' && typeof request.body?.query === 'string') {
    return /^\s*query\b/i.test(request.body.query)
  }
  return false
}

/** Writes are ordered barriers; reads can reuse recorded observations in the active or past phases. */
export class CassetteReplay {
  private readonly phases: { reads: Exchange[]; write?: Exchange; used: Set<number> }[] = [
    { reads: [], used: new Set() },
  ]
  private phase = 0
  private bindings = new Map<string, string>()

  constructor(cassette: Cassette) {
    for (const fixed of cassette.fixture.run?.match(UUID_PATTERN) ?? []) {
      this.bindings.set(fixed, fixed)
    }
    for (const saved of cassette.exchanges) {
      const response = cassette.responses[saved.response]
      if (!response) {
        throw new Error(`Invalid cassette response index: ${saved.response}`)
      }
      const exchange: Exchange = { request: saved.request, response }
      const activePhase = this.phases.at(-1)!
      if (isReadExchange(exchange.request)) {
        activePhase.reads.push(exchange)
      } else {
        activePhase.write = exchange
        this.phases.push({ reads: [], used: new Set() })
      }
    }
  }

  respond(request: Exchange['request']): Exchange['response'] {
    const activePhase = this.phases[this.phase]!
    const candidates = isReadExchange(request)
      ? [
          ...activePhase.reads
            .map((exchange, index) => ({ exchange, index }))
            .filter(({ index }) => !activePhase.used.has(index)),
          ...activePhase.reads.map((exchange, index) => ({ exchange, index })).reverse(),
          ...this.phases
            .slice(0, this.phase)
            .reverse()
            .flatMap((past) =>
              [...past.reads].reverse().map((exchange) => ({ exchange, index: -2 })),
            ),
        ]
      : activePhase.write
        ? [{ exchange: activePhase.write, index: -1 }]
        : []

    for (const { exchange, index } of candidates) {
      const candidateBindings = new Map(this.bindings)
      if (!matchRequest(exchange.request, request, candidateBindings)) continue
      this.bindings = candidateBindings
      if (index === -1) this.phase++
      else if (index >= 0) activePhase.used.add(index)
      return JSON.parse(
        JSON.stringify(exchange.response).replace(
          UUID_PATTERN,
          (value) => candidateBindings.get(value) ?? value,
        ),
      ) as Exchange['response']
    }

    throw new Error(
      `Unrecorded cassette request in phase ${this.phase}: ${JSON.stringify(request)}`,
    )
  }

  verify(): void {
    if (this.phase !== this.phases.length - 1) {
      throw new Error(
        `Cassette replay omitted ${this.phases.length - 1 - this.phase} recorded write barriers`,
      )
    }
  }
}

export async function startCassetteServer(cassettePath: string): Promise<{
  url: string
  replay: CassetteReplay
  close: () => Promise<void>
}> {
  const cassette = JSON.parse(await readFile(cassettePath, 'utf8')) as Cassette
  const replay = new CassetteReplay(cassette)

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8')
      let parsedBody: JsonObject | null = null
      if (rawBody.trim()) {
        try {
          parsedBody = JSON.parse(rawBody) as JsonObject
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON request body' }))
          return
        }
      }

      try {
        const matched = replay.respond({
          method: req.method ?? 'GET',
          path: req.url ?? '/',
          body: parsedBody,
        })
        res.writeHead(matched.status, {
          'Content-Type': 'application/json',
          ...(matched.headers ?? {}),
        })
        res.end(matched.body === null ? '' : JSON.stringify(matched.body))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            errors: [{ message: error instanceof Error ? error.message : String(error) }],
          }),
        )
      }
    })
  })

  await new Promise<void>((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind cassette HTTP server')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    replay,
    close: () =>
      new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise())
      }),
  }
}

// Helpers ---------------------------------------------------------------------
function normalizeGraphqlWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function matchRequest(
  expected: unknown,
  actual: unknown,
  bindings: Map<string, string>,
  parentKey?: string,
): boolean {
  if (typeof expected === 'string' && typeof actual === 'string') {
    const leftStr = parentKey === 'query' ? normalizeGraphqlWhitespace(expected) : expected
    const rightStr = parentKey === 'query' ? normalizeGraphqlWhitespace(actual) : actual
    const originals = leftStr.match(UUID_PATTERN) ?? []
    const values = rightStr.match(UUID_PATTERN) ?? []
    if (
      leftStr.replace(UUID_PATTERN, '<uuid>') !== rightStr.replace(UUID_PATTERN, '<uuid>') ||
      originals.length !== values.length
    ) {
      return false
    }
    return originals.every((original, idx) => {
      const candidate = values[idx]!
      if (bindings.has(original)) return bindings.get(original) === candidate
      if ([...bindings.values()].includes(candidate)) return false
      bindings.set(original, candidate)
      return true
    })
  }

  if (
    expected === null ||
    actual === null ||
    typeof expected !== 'object' ||
    typeof actual !== 'object'
  ) {
    return expected === actual
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) return false
  const left = expected as Record<string, unknown>
  const right = actual as Record<string, unknown>
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    JSON.stringify(leftKeys) === JSON.stringify(rightKeys) &&
    leftKeys.every((key) => matchRequest(left[key], right[key], bindings, key))
  )
}
