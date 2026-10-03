import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import {
  JsonFileStore,
  JsonFileStoreMissingItemError,
  JsonFileStoreNotFoundError,
  JsonFileStoreReadError,
  JsonFileStoreValidationError,
  JsonFileStoreWriteError,
  type JsonItem,
} from './json-file-store'

// Setup -----------------------------------------------------------------------
const itemSchema = z.strictObject({ id: z.string(), value: z.number() })
const directories: string[] = []

type Item = z.infer<typeof itemSchema> & JsonItem

// Tests -----------------------------------------------------------------------
describe('JsonFileStore', () => {
  test('initializes without clobbering and preserves envelope metadata', async () => {
    // Arrange
    const store = await storeInTempDir()
    await mkdir(dirname(store.file), { recursive: true })
    await writeFile(store.file, '{"version":1,"owner":"me","items":[]}')
    // Act
    const created = await store.initialize()
    // Assert
    expect(created).toBe(false)
    expect(JSON.parse(await readFile(store.file, 'utf8')).owner).toBe('me')
  })

  test('lists, reads, upserts, updates, and replaces items', async () => {
    // Arrange
    const store = await storeInTempDir()
    await store.initialize()
    // Act
    await store.write({ id: 'a', value: 1 })
    await store.write({ id: 'a', value: 2 })
    const updated = await store.update('a', (item) => ({ ...item, value: 3 }))
    await store.replace([{ id: 'b', value: 4 }])
    // Assert
    expect(updated.value).toBe(3)
    await expect(store.read('a')).rejects.toBeInstanceOf(JsonFileStoreMissingItemError)
    expect(await store.list()).toEqual([{ id: 'b', value: 4 }])
  })

  test('rejects duplicate IDs and malformed or invalid envelopes', async () => {
    // Arrange
    const store = await storeInTempDir()
    await store.initialize()
    await writeFile(store.file, '{"version":2,"items":[]}')
    // Act and Assert
    await expect(store.list()).rejects.toBeInstanceOf(JsonFileStoreValidationError)
    await writeFile(store.file, '{"version":1,"items":[{"id":"a","value":1},{"id":"a","value":2}]}')
    await expect(store.list()).rejects.toBeInstanceOf(JsonFileStoreValidationError)
    await writeFile(store.file, '{invalid')
    await expect(store.list()).rejects.toBeInstanceOf(JsonFileStoreValidationError)
    await writeFile(store.file, '{"version":1,"items":[{"id":"a"}]}')
    await expect(store.list()).rejects.toBeInstanceOf(JsonFileStoreValidationError)
  })

  test('rejects duplicate IDs introduced by update', async () => {
    // Arrange
    const store = await storeInTempDir()
    await store.initialize([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ])
    // Act
    const operation = store.update('a', (item) => ({ ...item, id: 'b' }))
    // Assert
    await expect(operation).rejects.toBeInstanceOf(JsonFileStoreValidationError)
  })

  test('reports missing items and typed read and write failures', async () => {
    // Arrange
    const store = await storeInTempDir()
    // Act and Assert
    await expect(store.read('missing')).rejects.toBeInstanceOf(JsonFileStoreReadError)
    await expect(store.list()).rejects.toBeInstanceOf(JsonFileStoreReadError)
    await expect(store.replace([])).rejects.toBeInstanceOf(JsonFileStoreWriteError)
  })

  test('distinguishes missing files from other read failures', async () => {
    // Arrange
    const missingStore = await storeInTempDir()
    const directoryStore = await storeInTempDir()
    await mkdir(directoryStore.file, { recursive: true })
    // Act and Assert
    await expect(missingStore.list()).rejects.toBeInstanceOf(JsonFileStoreNotFoundError)
    await expect(missingStore.list()).rejects.toBeInstanceOf(JsonFileStoreReadError)
    await expect(directoryStore.list()).rejects.toBeInstanceOf(JsonFileStoreReadError)
    await expect(directoryStore.list()).rejects.not.toBeInstanceOf(JsonFileStoreNotFoundError)
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// Helpers ---------------------------------------------------------------------
async function storeInTempDir(): Promise<JsonFileStore<Item>> {
  const directory = await mkdtemp(join(tmpdir(), 'difflab-json-store-'))
  directories.push(directory)
  return new JsonFileStore(join(directory, 'nested', 'items.json'), itemSchema, {
    itemsKey: 'items',
    metadata: { version: 1 },
  })
}
