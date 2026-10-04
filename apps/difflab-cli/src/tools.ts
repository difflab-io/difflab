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
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export type ToolDefinition = {
  name: string
  config: {
    description: string
    inputSchema: z.ZodType
    annotations?: ToolAnnotations
    outputSchema?: z.ZodType
  }
  callback: (untrustedInput: unknown) => Promise<ToolResult>
}

// API -------------------------------------------------------------------------
export function defineTool<Schema extends z.ZodType, Output>(
  name: string,
  config: {
    description: string
    inputSchema: Schema
    annotations?: ToolAnnotations
    outputSchema?: z.ZodType
  },
  handler: (input: z.output<Schema>) => Promise<Output>,
  options: {
    errorHint?: string
    toStructuredContent?: (value: Output) => Record<string, unknown>
  } = {},
): ToolDefinition {
  return {
    name,
    config: {
      description: config.description,
      inputSchema: config.inputSchema,
      ...(config.annotations ? { annotations: config.annotations } : {}),
      ...(config.outputSchema ? { outputSchema: config.outputSchema } : {}),
    },
    callback: async (untrustedInput: unknown) => {
      try {
        const value = await handler(config.inputSchema.parse(untrustedInput))
        return serializeToolResult(
          value,
          config.outputSchema,
          options.toStructuredContent?.(value) ?? value,
        )
      } catch (error) {
        return {
          ...serializeToolResult(
            {
              error: `${error instanceof Error ? error.message : String(error)}${options.errorHint ? ` ${options.errorHint}` : ''}`,
            },
            undefined,
          ),
          isError: true,
        }
      }
    },
  }
}

// Helpers ---------------------------------------------------------------------
function serializeToolResult(
  value: unknown,
  outputSchema?: z.ZodType,
  content = value,
): ToolResult {
  const structuredContent = outputSchema?.parse(content)
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    ...(structuredContent
      ? { structuredContent: structuredContent as Record<string, unknown> }
      : {}),
  }
}
