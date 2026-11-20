import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { DifflabConfig, DifflabConfigError, InvalidRepoConfig } from './index.js'

// Setup -----------------------------------------------------------------------
let temp: string
let repo: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-config-'))
  repo = join(temp, 'repo')
  await mkdir(repo)
})

// Tests -----------------------------------------------------------------------
describe('DifflabConfig.load', () => {
  it('should validate all environment variables in one pass and report bulk errors', () => {
    // Arrange
    const badEnv = { DIFFLAB_MODE: 'invalid', PORT: '99999' }

    // Act / Assert
    try {
      DifflabConfig.load({ env: badEnv })
      throw new Error('expected DifflabConfigError')
    } catch (error) {
      expect(error).toBeInstanceOf(DifflabConfigError)
      expect((error as Error).message).toContain('DIFFLAB_MODE')
      expect((error as Error).message).toContain('PORT')
    }
  })
})

describe('DifflabConfig.readRepo', () => {
  it('should report malformed YAML as InvalidRepoConfig', async () => {
    // Arrange
    await writeFile(join(repo, 'difflab.yaml'), 'schemaVersion: [')

    // Act / Assert
    await expect(DifflabConfig.readRepo(repo)).rejects.toBeInstanceOf(InvalidRepoConfig)
  })

  it('should group all schema issues into one InvalidRepoConfig', async () => {
    // Arrange
    await writeFile(
      join(repo, 'difflab.yaml'),
      'schemaVersion: 2\nproject:\n  id: bad\nextra: true\n',
    )

    // Act / Assert
    try {
      await DifflabConfig.readRepo(repo)
      throw new Error('expected InvalidRepoConfig')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRepoConfig)
      expect((error as Error).message).toContain('schemaVersion')
      expect((error as Error).message).toContain('project.id')
      expect((error as Error).message).toContain('Unrecognized key')
    }
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})
