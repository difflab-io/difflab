import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TodoStore } from './store'

const directories: string[] = []

async function storeInTempDir(): Promise<TodoStore> {
  const directory = await mkdtemp(join(tmpdir(), 'difflab-todo-'))
  directories.push(directory)
  return new TodoStore(join(directory, 'nested', 'todos.json'))
}

async function expectFailure(operation: Promise<unknown>, message: string): Promise<void> {
  let failure: unknown
  try {
    await operation
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(Error)
  if (failure instanceof Error) expect(failure.message).toContain(message)
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

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
    await expectFailure(store.remove(second.id), 'Unknown task ID')
  })

  test('does not silently replace corrupt or missing files', async () => {
    const store = await storeInTempDir()
    await expectFailure(store.list(), 'Call todo_init first')
    await store.initialize()
    await writeFile(store.file, '{invalid')
    await expectFailure(store.initialize(), 'Invalid todo list')
    await expectFailure(store.add('task'), 'Invalid todo list')
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
