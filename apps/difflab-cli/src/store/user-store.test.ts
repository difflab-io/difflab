import { afterEach, beforeEach, expect, test } from 'bun:test'
import { lstat, mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUserStore, userPaths, UserStoreError } from './user-store.js'

// Setup -----------------------------------------------------------------------
let temp: string
let home: string
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'difflab-user-store-'))
  home = join(temp, 'home')
  await mkdir(home)
})

// Tests -----------------------------------------------------------------------
test('listing an absent database never creates directories or SQLite sidecars', async () => {
  // Arrange
  const paths = userPaths(home)

  // Act
  const projects = await createUserStore(home).listProjects()

  // Assert
  expect(projects).toEqual([])
  await expect(lstat(paths.root)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('read-only operations do not create an artifact directory or database sidecars', async () => {
  // Arrange
  await createUserStore(home).createProject('ONE', 'One')
  const paths = userPaths(home)
  await rm(paths.projects, { recursive: true })
  const before = await readdir(paths.root)

  // Act
  const projects = await createUserStore(home).listProjects()

  // Assert
  expect(projects.map((project) => project.id)).toEqual(['ONE'])
  expect(await readdir(paths.root)).toEqual(before)
  await expect(lstat(paths.projects)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('rejects a symlinked user store path instead of writing outside home', async () => {
  // Arrange
  const outside = join(temp, 'outside')
  await mkdir(outside)
  await symlink(outside, userPaths(home).root)

  // Act / Assert
  await expect(createUserStore(home).createProject('ONE', 'One')).rejects.toBeInstanceOf(
    UserStoreError,
  )
  expect(await readdir(outside)).toEqual([])
})

test('closes the database after a conflict so a later write succeeds', async () => {
  // Arrange
  const store = createUserStore(home)
  await store.createProject('ONE', 'One')

  // Act
  await expect(store.createProject('ONE', 'Duplicate')).rejects.toThrow('already exists')
  const project = await store.createProject('TWO', 'Two')

  // Assert
  expect(project.id).toBe('TWO')
  expect((await store.listProjects()).map((item) => item.id)).toEqual(['ONE', 'TWO'])
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await rm(temp, { recursive: true, force: true })
})
