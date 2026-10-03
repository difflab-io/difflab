import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDirectory, expectFailureWith } from '../extensions/testx'
import { JsonFileStoreReadError } from '../stores/json-file-store.js'
import { TodoStore } from './store'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
describe('todo file', () => {
  test('initialization creates the file once without replacing existing tasks', async () => {
    const store = await storeInTempDir()
    expect(await store.initialize()).toEqual({ created: true, list: { version: 1, tasks: [] } })
    const task = await store.add('Review PR')
    expect((await store.initialize()).created).toBe(false)
    expect((await store.list()).tasks).toEqual([task])
    expect(JSON.parse(await readFile(store.file, 'utf8'))).toEqual({ version: 1, tasks: [task] })
  })

  test('adds, completes, and removes a task by ID', async () => {
    const store = await storeInTempDir()
    await store.initialize()
    const first = await store.add('  Ship CLI  ')
    const second = await store.add('Write docs')
    expect(first.text).toBe('Ship CLI')
    expect(first.done).toBe(false)
    expect((await store.complete(first.id)).done).toBe(true)
    expect((await store.complete(first.id)).done).toBe(true)
    expect(await store.remove(second.id)).toEqual(second)
    expect((await store.list()).tasks).toEqual([{ ...first, done: true }])
    await expectFailureWith(store.remove(second.id), 'Unknown task ID')
  })

  test('maps missing files consistently for list, add, remove, and complete', async () => {
    const store = await storeInTempDir()
    await expectFailureWith(store.list(), 'Call todo_init first')
    await expectFailureWith(store.add('task'), 'Call todo_init first')
    await expectFailureWith(store.remove('missing'), 'Call todo_init first')
    await expectFailureWith(store.complete('missing'), 'Call todo_init first')
  })

  test('propagates non-not-found read failures', async () => {
    const store = await storeInTempDir()
    await mkdir(store.file, { recursive: true })
    let failure: unknown
    try {
      await store.list()
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(JsonFileStoreReadError)
    if (failure instanceof JsonFileStoreReadError) {
      expect(failure.message).not.toContain('Call todo_init first')
      expect((failure.cause as NodeJS.ErrnoException).code).toBe('EISDIR')
    }
  })

  test('maps corrupt files consistently for add, remove, and complete', async () => {
    const store = await storeInTempDir()
    await store.initialize()
    await writeFile(store.file, '{invalid')
    await expectFailureWith(store.initialize(), 'Invalid todo list')
    await expectFailureWith(store.add('task'), 'Invalid todo list')
    await expectFailureWith(store.remove('missing'), 'Invalid todo list')
    await expectFailureWith(store.complete('missing'), 'Invalid todo list')
    expect(await readFile(store.file, 'utf8')).toBe('{invalid')
  })

  test('keeps separate paths independent', async () => {
    const first = await storeInTempDir()
    const second = await storeInTempDir()
    await first.initialize()
    await second.initialize()
    await first.add('Only in first file')
    expect((await first.list()).tasks).toHaveLength(1)
    expect((await second.list()).tasks).toHaveLength(0)
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

// Helpers ---------------------------------------------------------------------
async function storeInTempDir(): Promise<TodoStore> {
  const directory = await createTempDirectory('difflab-todo-')
  cleanups.push(directory.cleanup)
  return new TodoStore(join(directory.path, 'nested', 'todos.json'))
}
