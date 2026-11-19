import { Database } from 'bun:sqlite'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDifflabDb as createLegacyDifflabDb } from 'difflab-db-legacy'

// Types -----------------------------------------------------------------------
export type LegacyProjectFixture = {
  key: string
  name: string
  origins?: string[]
}

export type GitRepoOptions = {
  subpath?: string
  originUrl?: string
  branch?: string
}

// API -------------------------------------------------------------------------
export async function seedLegacyDatabase(
  legacySqlitePath: string,
  projects: LegacyProjectFixture[],
): Promise<string> {
  const legacyDb = await createLegacyDifflabDb(legacySqlitePath)
  try {
    await legacyDb.migrate()
    for (const project of projects) {
      await legacyDb.projects.createProject(project.key, project.name, project.origins ?? [])
    }
  } finally {
    await legacyDb.close()
  }
  return await sha256File(legacySqlitePath)
}

export function createUnmigratedNonLegacySqlite(sqlitePath: string): void {
  const raw = new Database(sqlitePath, { create: true, strict: true })
  try {
    raw.exec('CREATE TABLE custom_notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);')
    raw.exec("INSERT INTO custom_notes (id, body) VALUES ('1', 'unmigrated');")
  } finally {
    raw.close()
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

export async function createGitRepository(
  workspaceDir: string,
  options: GitRepoOptions = {},
): Promise<string> {
  const repoDir = options.subpath ? join(workspaceDir, options.subpath) : workspaceDir
  await mkdir(repoDir, { recursive: true })
  const branch = options.branch ?? 'main'
  const originUrl = options.originUrl ?? 'https://github.com/acme/demo-repo.git'

  runGit(repoDir, ['init', '-b', branch])
  runGit(repoDir, ['config', 'user.name', 'Difflab E2E'])
  runGit(repoDir, ['config', 'user.email', 'e2e@difflab.test'])
  await writeFile(join(repoDir, 'README.md'), '# Demo Repository\n', 'utf8')
  runGit(repoDir, ['add', 'README.md'])
  runGit(repoDir, ['commit', '-m', 'chore: initial commit'])
  if (originUrl) {
    runGit(repoDir, ['remote', 'add', 'origin', originUrl])
  }
  return repoDir
}

export function createGitWorktree(
  mainRepoDir: string,
  worktreeDir: string,
  branchName: string,
): string {
  runGit(mainRepoDir, ['worktree', 'add', '-b', branchName, worktreeDir])
  return worktreeDir
}

// Helpers ---------------------------------------------------------------------
function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
  })
}
