import { describe, expect, test } from 'bun:test'
import { CommandExecutionError } from '../errors'
import { runCommand } from './processx'

describe('command execution utilities', () => {
  test('runs a successful command', () => {
    // Arrange
    const command = process.execPath
    const args = ['-e', 'process.exit(0)']
    // Act
    const result = runCommand(command, args, process.cwd())
    // Assert
    expect(result).toBeUndefined()
  })

  test('wraps command failures with the original cause', () => {
    // Arrange
    const command = 'difflab-command-that-does-not-exist'
    // Act
    const error = (() => {
      try {
        runCommand(command, [], process.cwd())
        return undefined
      } catch (reason) {
        return reason
      }
    })()
    // Assert
    expect(error).toBeInstanceOf(CommandExecutionError)
    expect((error as CommandExecutionError).cause).toBeDefined()
  })
})
