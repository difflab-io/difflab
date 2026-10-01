import { z } from 'zod'

type ToolAnnotations = {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export type ToolDefinition = {
  name: string
  config: {
    description: string
    inputSchema: z.ZodType
    annotations?: ToolAnnotations
  }
  callback: (input: unknown) => Promise<ToolResult>
}

function result(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

export function defineTool<Schema extends z.ZodType>(
  name: string,
  config: { description: string; inputSchema: Schema; annotations?: ToolAnnotations },
  handler: (input: z.output<Schema>) => Promise<unknown>,
): ToolDefinition {
  return {
    name,
    config: {
      description: config.description,
      inputSchema: config.inputSchema,
      ...(config.annotations ? { annotations: config.annotations } : {}),
    },
    callback: async (input: unknown) => {
      try {
        return result(await handler(config.inputSchema.parse(input)))
      } catch (error) {
        return {
          ...result({ error: error instanceof Error ? error.message : String(error) }),
          isError: true,
        }
      }
    },
  }
}
