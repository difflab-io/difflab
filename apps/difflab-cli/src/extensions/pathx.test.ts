import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePath } from './pathx'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('path resolution', () => {
  test('resolves nested relative files inside an existing absolute cwd', async () => {
    // Arrange
    const { cwd } = await fixture()
    const root = await realpath(cwd)

    // Act
    const nested = await resolvePath(cwd, 'lists/data.json')
    const normalized = await resolvePath(cwd, 'lists/../data.json')

    // Assert
    expect(nested).toBe(join(root, 'lists', 'data.json'))
    expect(normalized).toBe(join(root, 'data.json'))
  })

  test('rejects missing or relative cwd, absolute path, and traversal outside cwd', async () => {
    // Arrange
    const { cwd, outside } = await fixture()

    // Act and Assert
    await expectFailure(resolvePath('workspace', 'data.json'), 'cwd must be an absolute path')
    await expectFailure(resolvePath(join(outside, 'missing'), 'data.json'), 'ENOENT')
    await expectFailure(
      resolvePath(cwd, join(outside, 'data.json')),
      'path must be a non-empty relative',
    )
    await expectFailure(resolvePath(cwd, '../outside/data.json'), 'outside cwd')
    await expectFailure(resolvePath(cwd, '.'), 'inside cwd')
  })

  test('rejects symlinked directories and files', async () => {
    // Arrange
    const { cwd, outside } = await fixture()
    await symlink(outside, join(cwd, 'link'))
    const external = join(outside, 'data.json')
    await writeFile(external, '{}')
    await symlink(external, join(cwd, 'data.json'))

    // Act and Assert
    await expectFailure(resolvePath(cwd, 'link/data.json'), 'Symlink paths are not allowed')
    await expectFailure(resolvePath(cwd, 'data.json'), 'Symlink paths are not allowed')
  })
})

// Helpers ---------------------------------------------------------------------

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
