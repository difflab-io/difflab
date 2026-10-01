import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { defineTool } from '../tools.js'
import { resolveTodoPath } from './path.js'
import { TodoStore } from './store.js'

const cwd = z
  .string()
  .refine(isAbsolute, 'cwd must be an absolute path')
  .describe(
    'Absolute path to an existing base directory, such as the repository root. Never use the server process cwd implicitly.',
  )
const path = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0 && !isAbsolute(value), 'path must be relative to cwd')
  .describe(
    'Relative path to the JSON todo file inside cwd, such as todos.json or .local/todos.json. No escaping cwd or symlinks.',
  )
const id = z
  .uuid()
  .describe('Stable task ID returned by todo_add or todo_list (not its list position)')
const fileInput = { cwd, path }

async function store(cwd: string, path: string): Promise<TodoStore> {
  return new TodoStore(await resolveTodoPath(cwd, path))
}

export const todoTools = [
  defineTool(
    'todo_init',
    {
      description:
        'Create a JSON todo list at relative path inside absolute cwd if absent. Never reset existing tasks. Call before other operations if the file does not exist.',
      inputSchema: z.strictObject(fileInput),
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ cwd, path }) => (await store(cwd, path)).initialize(),
  ),
  defineTool(
    'todo_list',
    {
      description:
        'Read all tasks and their stable IDs from the JSON todo list at relative path inside absolute cwd. Does not create the file.',
      inputSchema: z.strictObject(fileInput),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ cwd, path }) => (await store(cwd, path)).list(),
  ),
  defineTool(
    'todo_add',
    {
      description:
        'Add a non-empty text task to the existing JSON todo list at relative path inside absolute cwd; returns its stable ID. Call todo_init first if missing.',
      inputSchema: z.strictObject({
        ...fileInput,
        text: z.string().trim().min(1).describe('Task description to add'),
      }),
      annotations: { openWorldHint: false },
    },
    async ({ cwd, path, text }) => (await store(cwd, path)).add(text),
  ),
  defineTool(
    'todo_complete',
    {
      description:
        'Mark an existing task done by stable ID in the JSON todo list at relative path inside absolute cwd. Repeating the call is safe.',
      inputSchema: z.strictObject({ ...fileInput, id }),
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ cwd, path, id }) => (await store(cwd, path)).complete(id),
  ),
  defineTool(
    'todo_remove',
    {
      description:
        'Permanently delete an existing task by stable ID from the JSON todo list at relative path inside absolute cwd. Confirm intent before deleting.',
      inputSchema: z.strictObject({ ...fileInput, id }),
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    async ({ cwd, path, id }) => (await store(cwd, path)).remove(id),
  ),
]
