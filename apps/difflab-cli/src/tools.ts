import { z } from 'zod'

// Types -----------------------------------------------------------------------
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
  callback: (untrustedInput: unknown) => Promise<ToolResult>
}

// API -------------------------------------------------------------------------
export function defineTool<Schema extends z.ZodType, Output>(
  name: string,
  config: { description: string; inputSchema: Schema; annotations?: ToolAnnotations },
  handler: (input: z.output<Schema>) => Promise<Output>,
  options: { errorHint?: string } = {},
): ToolDefinition {
  return {
    name,
    config: {
      description: config.description,
      inputSchema: config.inputSchema,
      ...(config.annotations ? { annotations: config.annotations } : {}),
    },
    callback: async (untrustedInput: unknown) => {
      try {
        return serializeToolResult(await handler(config.inputSchema.parse(untrustedInput)))
      } catch (error) {
        return {
          ...serializeToolResult({
            error: `${error instanceof Error ? error.message : String(error)}${options.errorHint ? ` ${options.errorHint}` : ''}`,
          }),
          isError: true,
        }
      }
    },
  }
}

// Helpers ---------------------------------------------------------------------
function serializeToolResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}
