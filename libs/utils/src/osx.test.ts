import { describe, expect, test } from 'bun:test'
import { hasErrorCode } from './osx.js'

// Tests -----------------------------------------------------------------------
describe('OS error utilities', () => {
  test('matches native Node error codes without changing the error', () => {
    // Arrange
    const error = Object.assign(new Error('missing'), { code: 'ENOENT' })

    // Act
    const matches = hasErrorCode(error, 'ENOENT')
    const mismatch = hasErrorCode(error, 'EACCES')

    // Assert
    expect(matches).toBe(true)
    expect(mismatch).toBe(false)
  })

  test('rejects values that are not errors', () => {
    // Arrange
    const value = { code: 'ENOENT' }

    // Act
    const matches = hasErrorCode(value, 'ENOENT')

    // Assert
    expect(matches).toBe(false)
  })
})
