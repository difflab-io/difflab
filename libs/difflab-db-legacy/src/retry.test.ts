import { expect, test } from 'bun:test'
import { retryDatabaseOperation } from './retry.js'

// Tests -----------------------------------------------------------------------
test('retries a whole operation when SQLite contention is nested in causes', async () => {
  let attempts = 0
  const result = await retryDatabaseOperation(async () => {
    attempts++
    if (attempts === 1)
      throw new Error('Transaction failed', {
        cause: new Error('Migration failed', { cause: new Error('SQLITE_BUSY_SNAPSHOT') }),
      })
    return 'committed'
  })
  expect(result).toBe('committed')
  expect(attempts).toBe(2)
})

test('does not retry a permanent schema error', async () => {
  let attempts = 0
  await expect(
    retryDatabaseOperation(async () => {
      attempts++
      throw new Error('invalid schema')
    }),
  ).rejects.toThrow('invalid schema')
  expect(attempts).toBe(1)
})
