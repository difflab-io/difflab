import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureFileParent, patchJsonToFile, readJsonFile } from './fsx'

// Tests -----------------------------------------------------------------------
describe('file parent utility', () => {
  test('creates missing directories inside the base directory', async () => {
    // Arrange
    const home = await mkdtemp(join(tmpdir(), 'difflab-fsx-'))
    try {
      // Act
      const file = await ensureFileParent('one/two/custom.md', home)
      await writeFile(file, '# Document\n')
      // Assert
      expect(await readFile(join(home, 'one/two/custom.md'), 'utf8')).toBe('# Document\n')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('defaults cwd to the process working directory', async () => {
    const relativeDirectory = `.difflab-fsx-test-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const relativePath = join(relativeDirectory, 'nested', 'custom.md')
    try {
      const file = await ensureFileParent(relativePath)
      expect(file).toBe(join(process.cwd(), relativePath))
    } finally {
      await rm(join(process.cwd(), relativeDirectory), { recursive: true, force: true })
    }
  })

  test('rejects traversal and symlinked parents without writing outside cwd', async () => {
    // Arrange
    const home = await mkdtemp(join(tmpdir(), 'difflab-fsx-'))
    try {
      await mkdir(join(home, 'target'))
      await symlink(join(home, 'target'), join(home, 'link'))
      // Act and assert: attach each rejection handler before starting the next operation.
      await expect(ensureFileParent('../escape.md', home)).rejects.toThrow('parent traversal')
      await expect(ensureFileParent('link/custom.md', home)).rejects.toThrow(
        'Symlink paths are not allowed',
      )
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})

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
