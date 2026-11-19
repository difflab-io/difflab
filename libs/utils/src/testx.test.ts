import { afterEach, describe, expect, it } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { assertIsolatedTestHome, createIsolatedTestHome, TestHomeIsolationError } from './testx.js'

// Setup -----------------------------------------------------------------------
const originalDifflabHome = process.env.DIFFLAB_HOME
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
describe('when calling createIsolatedTestHome', () => {
  it('should throw before touching disk given DIFFLAB_HOME pointing to ~/.difflab', async () => {
    // Arrange
    const forbidden = join(homedir(), '.difflab')
    process.env.DIFFLAB_HOME = forbidden

    // Act
    const attempt = createIsolatedTestHome()

    // Assert
    await expect(attempt).rejects.toBeInstanceOf(TestHomeIsolationError)
    expect(() => assertIsolatedTestHome(join(forbidden, 'nested'))).toThrow(TestHomeIsolationError)
  })

  it('should create an ephemeral directory outside ~/.difflab given a safe environment', async () => {
    // Arrange
    delete process.env.DIFFLAB_HOME

    // Act
    const isolated = await createIsolatedTestHome()
    cleanups.push(isolated.cleanup)

    // Assert
    expect(isolated.home).not.toContain(join(homedir(), '.difflab'))
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  if (originalDifflabHome === undefined) delete process.env.DIFFLAB_HOME
  else process.env.DIFFLAB_HOME = originalDifflabHome
  await Promise.all(cleanups.splice(0).map((fn) => fn()))
})
