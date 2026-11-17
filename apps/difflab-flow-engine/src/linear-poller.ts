import { z } from 'zod'

// Constants -------------------------------------------------------------------
export const READY_ISSUES_QUERY = `query ReadyIssues {
  issues(filter: { state: { name: { in: ["Ready", "Todo"] } } }, first: 25) {
    nodes {
      id
      identifier
      title
      description
      state { name }
      team { key }
      assignee { name displayName }
      labels { nodes { name } }
    }
  }
}`

const linearResponseSchema = z.object({
  data: z
    .object({
      issues: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            identifier: z.string(),
            title: z.string(),
            description: z.string().nullable().optional(),
            state: z.object({ name: z.string() }),
            team: z.object({ key: z.string() }).nullable().optional(),
            assignee: z
              .object({
                name: z.string().nullable().optional(),
                displayName: z.string().nullable().optional(),
              })
              .nullable()
              .optional(),
            labels: z
              .object({
                nodes: z.array(z.object({ name: z.string() })),
              })
              .nullable()
              .optional(),
          }),
        ),
      }),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

// Types -----------------------------------------------------------------------
export type PollOptions = {
  linearApiUrl?: string
  linearApiKey?: string
  appUrl?: string
}

export type NormalizedReadyIssue = {
  id: string
  identifier: string
  title: string
  description?: string
  state: string
  team?: string
  agent?: string
  assignee?: string
  labels: string[]
}

export type PollResult = {
  polled: number
  skipped?: string
  results: unknown[]
}

// API -------------------------------------------------------------------------
export async function pollLinearReadyIssues(options: PollOptions = {}): Promise<PollResult> {
  const linearApiUrl =
    options.linearApiUrl ?? process.env.DIFFLAB_LINEAR_API_URL ?? 'https://api.linear.app/graphql'
  const linearApiKey = options.linearApiKey ?? process.env.DIFFLAB_LINEAR_API_KEY ?? ''
  const appUrl = (options.appUrl ?? process.env.DIFFLAB_APP_URL ?? 'http://127.0.0.1:4317').replace(
    /\/$/,
    '',
  )

  if (!linearApiKey && linearApiUrl === 'https://api.linear.app/graphql') {
    return { polled: 0, skipped: 'missing_api_key', results: [] }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (linearApiKey) {
    headers.Authorization = linearApiKey
  }

  const linearRes = await fetch(linearApiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: READY_ISSUES_QUERY, variables: {} }),
  })
  if (!linearRes.ok) {
    const text = await linearRes.text().catch(() => '')
    throw new Error(`Linear GraphQL request failed (${linearRes.status}): ${text}`)
  }

  const parsed = linearResponseSchema.parse(await linearRes.json())
  if (parsed.errors?.length) {
    throw new Error(`Linear GraphQL error: ${parsed.errors[0]!.message}`)
  }

  const nodes = parsed.data?.issues.nodes ?? []
  const issues: NormalizedReadyIssue[] = nodes.map((node) => {
    const labels = (node.labels?.nodes ?? []).map((l) => l.name)
    const agentLabel = labels.find((l) => l.toLowerCase().startsWith('agent:'))
    const assignee = node.assignee?.displayName ?? node.assignee?.name ?? undefined
    const agent = agentLabel ? agentLabel.slice('agent:'.length).trim() : assignee
    return {
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      ...(node.description ? { description: node.description } : {}),
      state: node.state.name,
      ...(node.team?.key ? { team: node.team.key } : {}),
      ...(agent ? { agent } : {}),
      ...(assignee ? { assignee } : {}),
      labels,
    }
  })

  if (issues.length === 0) {
    return { polled: 0, results: [] }
  }

  const triggerRes = await fetch(`${appUrl}/v1/triggers/linear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issues }),
  })
  if (!triggerRes.ok) {
    const text = await triggerRes.text().catch(() => '')
    throw new Error(`difflab-app trigger ingress failed (${triggerRes.status}): ${text}`)
  }

  const body = (await triggerRes.json()) as { results?: unknown[] }
  return {
    polled: issues.length,
    results: body.results ?? [],
  }
}
