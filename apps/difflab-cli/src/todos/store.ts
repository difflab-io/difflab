import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

const taskSchema = z.strictObject({
  id: z.uuid(),
  text: z.string().min(1),
  done: z.boolean(),
})
const listSchema = z.strictObject({ version: z.literal(1), tasks: z.array(taskSchema) })

export type TodoTask = z.infer<typeof taskSchema>
export type TodoList = z.infer<typeof listSchema>

function isFileError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

export class TodoStore {
  readonly file: string

  constructor(file: string) {
    this.file = resolve(file)
  }

  async initialize(): Promise<{ created: boolean; list: TodoList }> {
    await mkdir(dirname(this.file), { recursive: true })
    const list: TodoList = { version: 1, tasks: [] }
    try {
      await writeFile(this.file, `${JSON.stringify(list, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
      return { created: true, list }
    } catch (error) {
      if (!isFileError(error, 'EEXIST')) throw error
      return { created: false, list: await this.read() }
    }
  }

  async list(): Promise<TodoList> {
    return this.read()
  }

  async add(text: string): Promise<TodoTask> {
    const value = z.string().trim().min(1).parse(text)
    const list = await this.read()
    const task: TodoTask = { id: randomUUID(), text: value, done: false }
    list.tasks.push(task)
    await this.write(list)
    return task
  }

  async complete(id: string): Promise<TodoTask> {
    const list = await this.read()
    const task = list.tasks.find((item) => item.id === id)
    if (!task) throw new Error(`Unknown task ID: ${id}`)
    task.done = true
    await this.write(list)
    return task
  }

  async remove(id: string): Promise<TodoTask> {
    const list = await this.read()
    const index = list.tasks.findIndex((item) => item.id === id)
    if (index === -1) throw new Error(`Unknown task ID: ${id}`)
    const [task] = list.tasks.splice(index, 1)
    await this.write(list)
    return task
  }

  private async read(): Promise<TodoList> {
    let content: string
    try {
      content = await readFile(this.file, 'utf8')
    } catch (error) {
      if (isFileError(error, 'ENOENT')) {
        throw new Error(`Todo list does not exist: ${this.file}. Call todo_init first.`, {
          cause: error,
        })
      }
      throw error
    }
    try {
      const list = listSchema.parse(JSON.parse(content))
      if (new Set(list.tasks.map((task) => task.id)).size !== list.tasks.length) {
        throw new Error('duplicate task IDs')
      }
      return list
    } catch (error) {
      throw new Error(
        `Invalid todo list at ${this.file}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  private async write(list: TodoList): Promise<void> {
    const temp = `${this.file}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, `${JSON.stringify(list, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
      await rename(temp, this.file)
    } finally {
      await rm(temp, { force: true })
    }
  }
}
