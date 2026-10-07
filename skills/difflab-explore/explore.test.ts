import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { embeddedSource } from '../../apps/difflab-cli/src/templates/source.js'

// Constants -------------------------------------------------------------------
const root = import.meta.dir

// Setup -----------------------------------------------------------------------
let sandbox: string | undefined

// Tests -----------------------------------------------------------------------
test('new only scaffolds research and optionally proposals', async () => {
  // Arrange
  const skill = await readFile(join(root, 'SKILL.md'), 'utf8')
  const workflow = await readFile(join(root, 'references/workflows/new.md'), 'utf8')

  // Act
  const summary = await embeddedSource.read('exploration-summary.md')
  const research = await embeddedSource.read('exploration-research.md')
  const proposal = await embeddedSource.read('exploration-proposal.md')

  // Assert
  expect(skill).toContain('.difflab/explore/<slug>')
  expect(skill).not.toContain('agents/')
  expect(workflow).toContain('research-only')
  expect(workflow).toContain('scaffold')
  expect(summary).toContain('## Evidence and freshness')
  expect(research).toContain('## Sources fetched')
  expect(proposal).toContain('## Sources')
})

test('update snapshots every live file before writing and never reuses a revision', async () => {
  // Arrange
  sandbox = await mkdtemp(join(tmpdir(), 'difflab-explore-'))
  const live = join(sandbox, 'explore', 'cache')
  const revisions = join(live, 'revisions')
  await mkdir(join(live, 'research'), { recursive: true })
  await mkdir(revisions)
  await writeFile(join(live, 'SUMMARY.md'), '# Existing\n')
  await writeFile(join(live, 'research', 'library.md'), '# Evidence\n')
  await writeFile(join(live, 'misc.txt'), 'attached notes\n')
  await mkdir(join(revisions, '1'))
  await mkdir(join(revisions, '3'))
  const workflow = await readFile(join(root, 'references/workflows/update.md'), 'utf8')

  // Act
  const next = join(revisions, '4')
  await mkdir(next)
  await expect(mkdir(next)).rejects.toMatchObject({ code: 'EEXIST' })

  // Assert
  expect(await readFile(join(live, 'SUMMARY.md'), 'utf8')).toBe('# Existing\n')
  expect(await readFile(join(live, 'research', 'library.md'), 'utf8')).toBe('# Evidence\n')
  expect(await readFile(join(live, 'misc.txt'), 'utf8')).toBe('attached notes\n')
  expect(workflow).toContain('max(N)+1')
  expect(workflow).toContain('every')
  expect(workflow).toContain('FEEDBACK.md')
  expect(workflow).toContain('Do not edit live files if any operation fails')
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  if (sandbox) await rm(sandbox, { recursive: true, force: true })
  sandbox = undefined
})
