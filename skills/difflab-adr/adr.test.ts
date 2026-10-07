import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

// Constants -------------------------------------------------------------------
const root = resolve(import.meta.dir, '../..')
const skillRoot = import.meta.dir
const recordDirectory = /^([0-9]{4})-[a-z0-9]+(?:-[a-z0-9]+)*$/
const legacyRecord = /^([0-9]{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/

// Setup -----------------------------------------------------------------------
let sandbox: string | undefined

// Tests -----------------------------------------------------------------------
describe('ADR skill contract', () => {
  test('numbers across directories, reserved directories, and legacy files without filling gaps', async () => {
    // Arrange
    const entries = [
      ['README.md', 'file'],
      ['template.md', 'file'],
      ['0001-first.md', 'file'],
      ['0003-third', 'directory'],
      ['0004-reserved', 'directory'],
      ['0005-not-a-record', 'file'],
      ['notes.md', 'file'],
    ] as const
    const init = await read('references/workflows/init.md')

    // Act
    const numbers = entries.flatMap(([name, kind]) => {
      const match = kind === 'directory' ? recordDirectory.exec(name) : legacyRecord.exec(name)
      return match ? [Number(match[1])] : []
    })
    const next = String(Math.max(0, ...numbers) + 1).padStart(4, '0')

    // Assert
    expect(next).toBe('0005')
    expect(init).toContain('never fill gaps')
    expect(init).toContain('9999')
    expect(init).toContain('legacy flat')
    expect(init).toContain('incomplete')
    expect(init).toContain('same decision')
  })

  test('requires draft reuse, clarification of ambiguous targets, and scaffold-only init', async () => {
    // Arrange
    const init = await read('references/workflows/init.md')
    const author = await read('references/workflows/new.md')
    const update = await read('references/workflows/update.md')

    // Assert
    expect(init).toContain('Leave all placeholders')
    expect(init).toContain('README index remains unchanged')
    expect(init).toContain('filename:"ADR.md"')
    expect(author).toContain('Reuse a clearly matching, still-placeholder scaffold')
    expect(author).toContain('legacy flat scaffold')
    expect(author).toContain('resources')
    expect(author).toContain('or multiple records match, ask')
    expect(update).toContain('several records could fit, or a directory has resources')
    expect(update).toContain('Preserve existing rationale, evidence, status, and history')
    expect(update).toContain('## Decision History')
    expect(update).toContain('Keep existing legacy ADRs at their current paths')
  })

  test('keeps bundled and repository templates aligned on core MADR headings', async () => {
    // Arrange
    const bundled = await readFile(
      join(root, 'apps/difflab-cli/templates/architecture-decision-record.md'),
      'utf8',
    )
    const repository = await readFile(join(root, 'adr/template.md'), 'utf8')
    const author = await read('references/workflows/new.md')

    // Assert
    for (const heading of [
      'Context and Problem Statement',
      'Decision Drivers',
      'Considered Options',
      'Decision Outcome',
      'Positive Consequences',
      'Negative Consequences',
    ]) {
      expect(bundled).toContain(heading)
      expect(repository).toContain(heading)
    }
    expect(author).toContain('architecture-decision-record')
    expect(author).toContain('Mermaid')
    expect(repository).toContain('../0005-example/ADR.md')
    expect(repository).toContain('../0005-example.md')
  })

  test('specifies linked numeric index entries and truthful status', async () => {
    // Arrange
    const index = await readFile(join(root, 'adr/README.md'), 'utf8')
    const author = await read('references/workflows/new.md')
    const update = await read('references/workflows/update.md')

    // Assert
    expect(index).toContain('| ADR | Status | Summary')
    expect(index).toContain('No ADRs yet.')
    expect(index).toContain('NNNN-kebab-title/ADR.md')
    expect(author).toContain('Replace the `No ADRs yet.` row')
    expect(author).toContain('relative link `(NNNN-kebab-title/ADR.md)`')
    expect(author).toContain('`(NNNN-kebab-title.md)` for a reused legacy scaffold')
    const indexDirectory = join(root, 'adr')
    const source = join(indexDirectory, '0003-api-boundary', 'ADR.md')
    const target = join(indexDirectory, '0004-queue-ownership', 'ADR.md')
    expect(relative(indexDirectory, target)).toBe('0004-queue-ownership/ADR.md')
    expect(relative(dirname(source), target)).toBe('../0004-queue-ownership/ADR.md')
    expect(relative(dirname(source), join(indexDirectory, '0001-cache-policy.md'))).toBe(
      '../0001-cache-policy.md',
    )
    expect(author).toContain("record's exact status")
    expect(update).toContain('matching row')
    expect(update).toContain('NNNN-title/ADR.md')
    expect(update).toContain('Never silently reset accepted to proposed')
  })

  test('directory collision protects an existing draft and colocated resources', async () => {
    // Arrange
    sandbox = await mkdtemp(join(tmpdir(), 'difflab-adr-'))
    const directory = join(sandbox, 'adr')
    const target = join(directory, '0001-cache-policy')
    const init = await read('references/workflows/init.md')
    const service = await readFile(join(root, 'apps/difflab-cli/src/templates/service.ts'), 'utf8')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'ADR.md'), '# Existing draft\n')
    await writeFile(join(target, 'topology.svg'), '<svg/>\n')

    // Act
    let collision: unknown
    try {
      await mkdir(target)
    } catch (error) {
      collision = error
    }

    // Assert
    expect((collision as { code?: string })?.code).toBe('EEXIST')
    expect(await readFile(join(target, 'ADR.md'), 'utf8')).toBe('# Existing draft\n')
    expect(await readFile(join(target, 'topology.svg'), 'utf8')).toBe('<svg/>\n')
    expect(service).toContain('constants.O_EXCL')
    const empty = join(directory, '0002-reserved')
    await mkdir(empty)
    await expect(mkdir(empty)).rejects.toMatchObject({ code: 'EEXIST' })
    expect(init).toContain('non-recursive, exclusive directory creation')
    expect(init).toContain('do not enter or overwrite it')
  })
})

// Cleanup ---------------------------------------------------------------------
afterEach(async () => {
  if (sandbox) await rm(sandbox, { recursive: true, force: true })
  sandbox = undefined
})

// Helpers ---------------------------------------------------------------------
async function read(relative: string): Promise<string> {
  return readFile(join(skillRoot, relative), 'utf8')
}
