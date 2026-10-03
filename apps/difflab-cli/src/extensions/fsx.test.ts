import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { patchJsonToFile, readJsonFile } from './fsx'

// Tests -----------------------------------------------------------------------
describe('JSON file utilities', () => {
  test('creates a nested JSON file', async () => {
    const home = await mkdtemp(join(tmpdir(), 'difflab-fsx-'))
    try {
      // Arrange
      const file = join(home, 'nested', 'config.json')
      // Act
      await patchJsonToFile(file, (value) => ({ ...value, enabled: true }))
      // Assert
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ enabled: true })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('preserves existing properties while patching', async () => {
    const home = await mkdtemp(join(tmpdir(), 'difflab-fsx-'))
    try {
      // Arrange
      const file = join(home, 'config.json')
      await writeFile(file, '{"keep":true,"count":1}\n')
      // Act
      await patchJsonToFile(file, (value) => ({ ...value, count: 2 }))
      // Assert
      expect(await readJsonFile(file)).toEqual({ keep: true, count: 2 })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('rejects malformed JSON without modifying it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'difflab-fsx-'))
    try {
      // Arrange
      const file = join(home, 'config.json')
      const original = '{broken'
      await writeFile(file, original)
      // Act
      const error = await patchJsonToFile(file, (value) => value).catch((reason: unknown) => reason)
      // Assert
      expect(error).toBeInstanceOf(SyntaxError)
      expect(await readFile(file, 'utf8')).toBe(original)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('refuses symlink JSON files', async () => {
    const home = await mkdtemp(join(tmpdir(), 'difflab-fsx-'))
    try {
      // Arrange
      const target = join(home, 'target.json')
      const file = join(home, 'config.json')
      await writeFile(target, '{}')
      await symlink(target, file)
      // Act
      const error = await readJsonFile(file).catch((reason: unknown) => reason)
      // Assert
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('symlink')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('does not modify a file when the patch callback fails', async () => {
    const home = await mkdtemp(join(tmpdir(), 'difflab-fsx-'))
    try {
      // Arrange
      const file = join(home, 'config.json')
      await writeFile(file, '{"keep":true}\n')
      // Act
      const error = await patchJsonToFile(file, () => {
        throw new Error('callback failed')
      }).catch((reason: unknown) => reason)
      // Assert
      expect(error).toBeInstanceOf(Error)
      expect(await readFile(file, 'utf8')).toBe('{"keep":true}\n')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
