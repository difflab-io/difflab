import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDifflabDb, type Project, type Repository } from './index.js'

// Constants -------------------------------------------------------------------
const workerPath = fileURLToPath(new URL('./concurrency-process.fixture.ts', import.meta.url))

// Tests -----------------------------------------------------------------------
test('separate processes can migrate and create distinct projects in one new database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'difflab-db-process-'))
  const dbPath = join(root, 'projects.sqlite')
  try {
    const results = await runWorkers(root, dbPath, 'create', 8)
    expect(results.map((project) => (project as Project).id).sort()).toEqual(
      Array.from({ length: 8 }, (_, index) => `PRJ${String(index).padStart(2, '0')}`),
    )
    const store = await createDifflabDb(dbPath)
    try {
      expect(await store.projects.listProjects()).toHaveLength(8)
    } finally {
      await store.close()
    }
    const db = new Database(dbPath, { readonly: true })
    try {
      expect(db.query('SELECT name FROM kysely_migration').all()).toEqual([{ name: '001_initial' }])
    } finally {
      db.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 40_000)

test('separate processes linking one origin all return the same repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'difflab-db-process-'))
  const dbPath = join(root, 'projects.sqlite')
  try {
    const store = await createDifflabDb(dbPath)
    try {
      await store.projects.createProject('BASE', 'Base')
    } finally {
      await store.close()
    }
    const results = (await runWorkers(root, dbPath, 'link', 12)) as Repository[]
    expect(new Set(results.map((repository) => repository.id)).size).toBe(1)
    expect(results.every((repository) => repository.projectId === 'BASE')).toBe(true)
    const check = await createDifflabDb(dbPath)
    try {
      expect((await check.projects.getProjectById('BASE')).repositories).toEqual([results[0]])
    } finally {
      await check.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 40_000)

test('a preexisting invalid schema still fails after bounded migration retries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'difflab-db-invalid-'))
  const dbPath = join(root, 'projects.sqlite')
  try {
    const db = new Database(dbPath)
    db.run('CREATE TABLE projects (invalid TEXT)')
    db.close()
    const started = Date.now()
    await expect(createDifflabDb(dbPath)).rejects.toThrow('Could not migrate project database')
    expect(Date.now() - started).toBeLessThan(10_000)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)

// Helpers ---------------------------------------------------------------------
async function runWorkers(
  root: string,
  dbPath: string,
  mode: 'create' | 'link',
  count: number,
): Promise<unknown[]> {
  const marker = join(root, 'start')
  const processes = Array.from({ length: count }, (_, index) =>
    Bun.spawn([process.execPath, workerPath, dbPath, marker, mode, String(index)], {
      stdout: 'pipe',
      stderr: 'pipe',
    }),
  )
  try {
    const readyDeadline = Date.now() + 15_000
    while ((await readdir(root)).filter((name) => name.endsWith('.ready')).length < count) {
      if (Date.now() > readyDeadline) throw new Error('Workers did not become ready')
      await Bun.sleep(10)
    }
    await writeFile(marker, '')
    const output = await Promise.race([
      Promise.all(
        processes.map(async (process) => ({
          exitCode: await process.exited,
          stdout: await new Response(process.stdout).text(),
          stderr: await new Response(process.stderr).text(),
        })),
      ),
      Bun.sleep(20_000).then(() => {
        throw new Error('Concurrent database workers timed out')
      }),
    ])
    expect(output.filter((item) => item.exitCode !== 0)).toEqual([])
    return output.map((item) => JSON.parse(item.stdout) as unknown)
  } finally {
    for (const process of processes) {
      if (process.exitCode === null) process.kill()
    }
    await Promise.allSettled(processes.map((process) => process.exited))
  }
}
