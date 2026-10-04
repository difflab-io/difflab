import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { defineTool } from './tools.js'

describe('defineTool output schemas', () => {
  test('returns structured content while preserving text content', async () => {
    const tool = defineTool(
      'example',
      {
        description: 'example',
        inputSchema: z.strictObject({}),
        outputSchema: z.object({ result: z.object({ value: z.number() }) }),
      },
      async () => ({ value: 42 }),
      { toStructuredContent: (result) => ({ result }) },
    )

    await expect(tool.callback({})).resolves.toEqual({
      content: [{ type: 'text', text: '{"value":42}' }],
      structuredContent: { result: { value: 42 } },
    })
  })

  test('keeps an unwrapped output schema for project tools', async () => {
    const tool = defineTool(
      'example',
      {
        description: 'example',
        inputSchema: z.strictObject({}),
        outputSchema: z.object({ value: z.number() }),
      },
      async () => ({ value: 42 }),
    )

    await expect(tool.callback({})).resolves.toEqual({
      content: [{ type: 'text', text: '{"value":42}' }],
      structuredContent: { value: 42 },
    })
  })

  test('keeps unstructured tools unchanged', async () => {
    const tool = defineTool(
      'example',
      { description: 'example', inputSchema: z.strictObject({}) },
      async () => ({ value: 42 }),
    )

    await expect(tool.callback({})).resolves.toEqual({
      content: [{ type: 'text', text: '{"value":42}' }],
    })
  })
})
