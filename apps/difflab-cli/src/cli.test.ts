import { describe, expect, test } from 'bun:test'
import { createProgram } from './cli'

// Tests -----------------------------------------------------------------------
describe('commander CLI', () => {
  test('shows help when no command is supplied', async () => {
    const output: string[] = []
    const program = createProgram()
    program.configureOutput({ writeOut: (message) => output.push(message) })

    await program.parseAsync([], { from: 'user' })

    expect(output.join('')).toContain('Usage: difflab-cli')
    expect(output.join('')).toContain('mcp')
    expect(output.join('')).not.toContain('Hello,')
  })
})
