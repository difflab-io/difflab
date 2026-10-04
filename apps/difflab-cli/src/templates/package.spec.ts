import { afterEach, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDirectory } from '../extensions/testx.js'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
test('packed CLI lists and scaffolds every bundled template outside the checkout', async () => {
  // Arrange
  const directory = await createTempDirectory('difflab-pack-')
  cleanups.push(directory.cleanup)
  const packageRoot = join(import.meta.dir, '..', '..')
  const unpack = join(directory.path, 'unpack')
  const home = join(directory.path, 'home')
  const cwd = join(directory.path, 'work')
  await Promise.all([mkdir(unpack), mkdir(home), mkdir(cwd)])
  execFileSync(process.execPath, ['run', 'build'], { cwd: packageRoot })
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', directory.path], {
      cwd: packageRoot,
      encoding: 'utf8',
    }),
  ) as { filename: string; files: { path: string }[] }[]
  const files = packed[0].files.map(({ path }) => path)
  const archive = join(directory.path, packed[0].filename)
  execFileSync('tar', ['-xzf', archive, '-C', unpack])
  const entry = join(unpack, 'package', 'dist', 'index.js')
  const env = { ...process.env, HOME: home }

  // Act
  const listed = execFileSync(process.execPath, [entry, 'templates', 'list'], {
    cwd,
    env,
    encoding: 'utf8',
  })
  const names = [
    'spec-driven-plan',
    'software-architecture-design',
    'architecture-decision-record',
    'product-requirements-document',
    'code-review',
    'planning-intent',
    'ui-component-architecture',
    'pull-request-description',
  ]
  for (const name of names) {
    execFileSync(
      process.execPath,
      [entry, 'templates', 'scaffold', name, 'generated/deep', `${name}.md`],
      { cwd, env },
    )
  }

  // Assert
  expect(
    files.filter((path) => path.startsWith('templates/examples/') && path.endsWith('.md')),
  ).toHaveLength(10)
  expect(await readdir(join(home, '.difflab', 'templates', 'examples'))).toHaveLength(10)
  for (const name of names) {
    expect(files).toContain(`templates/${name}.md`)
    expect(listed).toContain(name)
    expect(await readFile(join(cwd, 'generated/deep', `${name}.md`), 'utf8')).toBe(
      await readFile(join(unpack, 'package', 'templates', `${name}.md`), 'utf8'),
    )
  }
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})
