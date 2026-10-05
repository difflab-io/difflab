import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDirectory, expectFailureWith } from '../extensions/testx.js'
import { appendProgressLog } from './store.js'

// Setup -----------------------------------------------------------------------
const cleanups: (() => Promise<void>)[] = []

// Tests -----------------------------------------------------------------------
describe('progress log', () => {
  test('creates logs.txt on first append and preserves existing entries', async () => {
    // Arrange
    const directory = await createTempDirectory('difflab-log-')
    cleanups.push(directory.cleanup)
    const path = join(await realpath(directory.path), 'logs.txt')
    const now = new Date(2026, 9, 5, 4, 12, 13)

    // Act
    const first = await appendProgressLog(path, 'Started phase 1', now)
    const second = await appendProgressLog(path, 'Finished phase 1', now)

    // Assert
    expect(first).toEqual({ path, entry: '[261005 04:12:13]: Started phase 1' })
    expect(second.entry).toBe('[261005 04:12:13]: Finished phase 1')
    expect(await readFile(path, 'utf8')).toBe(`${first.entry}\n${second.entry}\n`)
  })

  test('keeps concurrent log lines intact', async () => {
    // Arrange
    const directory = await createTempDirectory('difflab-log-')
    cleanups.push(directory.cleanup)
    const path = join(await realpath(directory.path), 'logs.txt')

    // Act
    await Promise.all(
      Array.from({ length: 30 }, (_, index) => appendProgressLog(path, `Step ${index}`)),
    )

    // Assert
    const lines = (await readFile(path, 'utf8')).trimEnd().split('\n')
    expect(lines).toHaveLength(30)
    expect(new Set(lines.map((line) => line.split(': Step ')[1]))).toEqual(
      new Set(Array.from({ length: 30 }, (_, index) => String(index))),
    )
  })

  test('rejects Unicode and control line separators without creating a log', async () => {
    // Arrange
    const directory = await createTempDirectory('difflab-log-')
    cleanups.push(directory.cleanup)
    const path = join(await realpath(directory.path), 'logs.txt')

    // Act / Assert
    for (const separator of ['\u2028', '\u2029', '\u0085', '\v', '\f', '\r', '\n']) {
      await expectFailureWith(
        appendProgressLog(path, `ok${separator}[261005 09:00:00]: fake`),
        'one non-empty line',
      )
    }
    expect(await Bun.file(path).exists()).toBe(false)
  })

  test('rejects nonphysical, traversing, symlinked and invalid paths', async () => {
    // Arrange
    const directory = await createTempDirectory('difflab-log-')
    cleanups.push(directory.cleanup)
    const root = await realpath(directory.path)
    const path = join(root, 'logs.txt')
    await mkdir(join(root, 'nested'))
    await symlink(root, join(root, 'linked'))
    await symlink(join(root, 'nested', 'outside.txt'), path)

    // Act / Assert
    await expectFailureWith(appendProgressLog('logs.txt', 'hello'), 'absolute')
    await expectFailureWith(appendProgressLog(`${root}/nested/../logs.txt`, 'hello'), 'normalized')
    await expectFailureWith(
      appendProgressLog(join(root, 'linked', 'logs.txt'), 'hello'),
      'symlinked',
    )
    await expectFailureWith(appendProgressLog(path, 'hello'), 'symlink')
    await expectFailureWith(appendProgressLog(join(root, 'other.txt'), 'hello'), 'logs.txt')
    await expectFailureWith(appendProgressLog(path, 'hello\nnew line'), 'one non-empty line')
    await expectFailureWith(appendProgressLog(path, ' '), 'one non-empty line')
    await expectFailureWith(appendProgressLog(path, 'x'.repeat(2049)), 'at most 2048 bytes')
    expect(await readFile(join(root, 'nested', 'outside.txt')).catch(() => null)).toBeNull()
  })

  test('rejects a directory named logs.txt and appends to an existing file', async () => {
    // Arrange
    const directory = await createTempDirectory('difflab-log-')
    cleanups.push(directory.cleanup)
    const root = await realpath(directory.path)
    const path = join(root, 'logs.txt')
    await mkdir(path)

    // Act / Assert
    await expectFailureWith(appendProgressLog(path, 'hello'), 'regular file')
    await rm(path, { recursive: true })
    await writeFile(path, 'manual entry\n')
    await appendProgressLog(path, 'hello')
    expect(await readFile(path, 'utf8')).toMatch(
      /^manual entry\n\[\d{6} \d{2}:\d{2}:\d{2}\]: hello\n$/,
    )
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})
