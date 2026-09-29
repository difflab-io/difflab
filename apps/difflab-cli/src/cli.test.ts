import { describe, expect, test } from 'bun:test'
import { createProgram, greeting } from './cli'

describe('commander CLI', () => {
  test('formats a greeting', () => {
    expect(greeting('Premise')).toBe('Hello, Premise!')
  })

  test('uses world when no name is supplied', async () => {
    const output: string[] = []
    await createProgram((message) => output.push(message)).parseAsync([], {
      from: 'user',
    })
    expect(output).toEqual(['Hello, world!'])
  })
})
