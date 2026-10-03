import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import {
  JsonFileStore,
  JsonFileStoreMissingItemError,
  JsonFileStoreNotFoundError,
  JsonFileStoreValidationError,
} from '../stores/json-file-store.js'

// Constants -------------------------------------------------------------------
const taskSchema = z.strictObject({ id: z.uuid(), text: z.string().min(1), done: z.boolean() })

// Types -----------------------------------------------------------------------
export type TodoTask = z.infer<typeof taskSchema>
export type TodoList = { version: 1; tasks: TodoTask[] }

// API -------------------------------------------------------------------------
export class TodoStore {
  readonly file: string
  private readonly tasks: JsonFileStore<TodoTask>

  constructor(file: string) {
    this.file = resolve(file)
    this.tasks = new JsonFileStore(this.file, taskSchema, {
      itemsKey: 'tasks',
      metadata: { version: 1 },
    })
  }

  async initialize(): Promise<{ created: boolean; list: TodoList }> {
    await mkdir(dirname(this.file), { recursive: true })
    const created = await this.tasks.initialize()
    return { created, list: created ? { version: 1, tasks: [] } : await this.list() }
  }

  async list(): Promise<TodoList> {
    try {
      return { version: 1, tasks: await this.tasks.list() }
    } catch (error) {
      if (error instanceof JsonFileStoreNotFoundError) {
        throw new Error(`Todo list does not exist: ${this.file}. Call todo_init first.`, {
          cause: error,
        })
      }
      if (error instanceof JsonFileStoreValidationError) {
        throw new Error(`Invalid todo list at ${this.file}`, { cause: error })
      }
      throw error
    }
  }

  async add(text: string): Promise<TodoTask> {
    const task = { id: randomUUID(), text: z.string().trim().min(1).parse(text), done: false }
    try {
      await this.tasks.write(task)
      return task
    } catch (error) {
      this.rethrowDomainError(error)
    }
  }

  async complete(id: string): Promise<TodoTask> {
    try {
      return await this.tasks.update(id, (task) => {
        task.done = true
      })
    } catch (error) {
      if (error instanceof JsonFileStoreMissingItemError)
        throw new Error(`Unknown task ID: ${id}`, { cause: error })
      this.rethrowDomainError(error)
    }
  }

  async remove(id: string): Promise<TodoTask> {
    let list: TodoTask[]
    try {
      list = await this.tasks.list()
    } catch (error) {
      this.rethrowDomainError(error)
    }
    const task = list.find((item) => item.id === id)
    if (!task) throw new Error(`Unknown task ID: ${id}`)
    try {
      await this.tasks.replace(list.filter((item) => item.id !== id))
      return task
    } catch (error) {
      this.rethrowDomainError(error)
    }
  }

  private rethrowDomainError(error: unknown): never {
    if (error instanceof JsonFileStoreNotFoundError) {
      throw new Error(`Todo list does not exist: ${this.file}. Call todo_init first.`, {
        cause: error,
      })
    }
    if (error instanceof JsonFileStoreValidationError) {
      throw new Error(`Invalid todo list at ${this.file}`, { cause: error })
    }
    throw error
  }
}
