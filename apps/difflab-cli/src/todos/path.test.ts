import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveTodoPath } from './path'

const directories: string[] = []

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'difflab-path-'))
  directories.push(base)
  const cwd = join(base, 'workspace')
  const outside = join(base, 'outside')
  await Promise.all([mkdir(cwd), mkdir(outside)])
  return { cwd, outside }
}

async function expectFailure(result: Promise<unknown>, message: string) {
  const error: unknown = await result.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(Error)
  if (error instanceof Error) expect(error.message).toContain(message)
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('todo path resolution', () => {
  test('resolves nested relative files inside an existing absolute cwd', async () => {
    const { cwd } = await fixture()
    const root = await realpath(cwd)
    expect(await resolveTodoPath(cwd, 'lists/todos.json')).toBe(join(root, 'lists', 'todos.json'))
    expect(await resolveTodoPath(cwd, 'lists/../todos.json')).toBe(join(root, 'todos.json'))
  })

  test('rejects missing or relative cwd, absolute path, and traversal outside cwd', async () => {
    const { cwd, outside } = await fixture()
    await expectFailure(resolveTodoPath('workspace', 'todos.json'), 'cwd must be an absolute path')
    await expectFailure(resolveTodoPath(join(outside, 'missing'), 'todos.json'), 'ENOENT')
    await expectFailure(
      resolveTodoPath(cwd, join(outside, 'todos.json')),
      'path must be a non-empty relative',
    )
    await expectFailure(resolveTodoPath(cwd, '../outside/todos.json'), 'outside cwd')
    await expectFailure(resolveTodoPath(cwd, '.'), 'inside cwd')
  })

  test('rejects symlinked directories and todo files', async () => {
    const { cwd, outside } = await fixture()
    await symlink(outside, join(cwd, 'link'))
    await expectFailure(resolveTodoPath(cwd, 'link/todos.json'), 'Symlink paths are not allowed')
    const external = join(outside, 'todos.json')
    await writeFile(external, '{}')
    await symlink(external, join(cwd, 'todos.json'))
    await expectFailure(resolveTodoPath(cwd, 'todos.json'), 'Symlink paths are not allowed')
  })
})
