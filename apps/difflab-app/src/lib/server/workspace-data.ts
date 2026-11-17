import { lstat, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { FlowRun, Project, Repository } from 'difflab-db'
import type { RepositoryRow } from 'ui'
import { getAppDb, resolveStorePaths } from './db.js'

// Constants -------------------------------------------------------------------
const MAX_MARKDOWN_CHARS = 48_000
const HEADING_REGEX = /^#\s+(.+)$/m
const STATUS_META_REGEX = /^-\s+\*\*Status:\*\*\s*(.+)$/im
const BRANCH_META_REGEX = /^-\s+\*\*Branch:\*\*\s*(.+)$/im
const REVISION_META_REGEX = /^-\s+\*\*Revision:\*\*\s*(.+)$/im
const MODE_META_REGEX = /^-\s+\*\*Mode:\*\*\s*(.+)$/im
const INTENT_META_REGEX = /^-\s+\*\*Intent:\*\*\s*(.+)$/im

// Types -----------------------------------------------------------------------
export interface WorkspacePlanItem {
  id: string
  projectId: string
  repoId: string
  repoShortName: string
  title: string
  status: string
  branch: string | null
  revisionCount: number
  summary: string
  markdown: string
  updatedAt: string
}

export interface WorkspaceReviewItem {
  id: string
  projectId: string
  repoId: string
  repoShortName: string
  title: string
  status: string
  revision: string | null
  mode: string | null
  hasRubric: boolean
  summary: string
  markdown: string
  updatedAt: string
}

export interface ProjectWorkspaceData {
  id: string
  name: string
  repositories: RepositoryRow[]
  plans: WorkspacePlanItem[]
  reviews: WorkspaceReviewItem[]
  counts: {
    repositories: number
    plans: number
    reviews: number
    flows: number
    activeFlows: number
  }
}

export interface WorkspaceSnapshot {
  projects: ProjectWorkspaceData[]
  repoProjectMap: Record<string, string>
  repoLabels: Record<string, string>
}

// API -------------------------------------------------------------------------
export async function loadWorkspaceSnapshot(runs: FlowRun[]): Promise<WorkspaceSnapshot> {
  const db = await getAppDb()
  const paths = resolveStorePaths()
  const [projects, repositories] = await Promise.all([
    db.projects.listProjects(),
    db.repositories.listRepositories(),
  ])

  const localDirLookup = await buildFallbackProjectsDirLookup()
  const repoProjectMap: Record<string, string> = {}
  const repoLabels: Record<string, string> = {}

  for (const repo of repositories) {
    repoProjectMap[repo.id] = repo.projectId
    repoLabels[repo.id] = `${repo.projectId} / ${formatShortRepoName(repo)}`
  }

  const runsByProject = new Map<string, FlowRun[]>()
  for (const run of runs) {
    const projectId = repoProjectMap[run.repoId]
    if (!projectId) continue
    const list = runsByProject.get(projectId) ?? []
    list.push(run)
    runsByProject.set(projectId, list)
  }

  const projectSnapshots = await Promise.all(
    projects.map((project) =>
      loadProjectSnapshot(
        project,
        repositories.filter((r) => r.projectId === project.id),
        runsByProject.get(project.id) ?? [],
        paths.projects,
        localDirLookup,
      ),
    ),
  )

  projectSnapshots.sort((a, b) => {
    const scoreA = a.counts.flows * 3 + a.counts.plans * 2 + a.counts.repositories
    const scoreB = b.counts.flows * 3 + b.counts.plans * 2 + b.counts.repositories
    if (scoreB !== scoreA) return scoreB - scoreA
    return a.id.localeCompare(b.id)
  })

  return {
    projects: projectSnapshots,
    repoProjectMap,
    repoLabels,
  }
}

// Helpers ---------------------------------------------------------------------
async function loadProjectSnapshot(
  project: Project,
  repos: Repository[],
  projectRuns: FlowRun[],
  projectsStoreRoot: string,
  localDirLookup: Map<string, string>,
): Promise<ProjectWorkspaceData> {
  const repoRows: RepositoryRow[] = []
  const plans: WorkspacePlanItem[] = []
  const reviews: WorkspaceReviewItem[] = []

  for (const repo of repos) {
    const shortName = formatShortRepoName(repo)
    const repoStoreDir = join(projectsStoreRoot, project.id, repo.slug)

    const [resolvedLocalPath, repoPlans, repoReviews] = await Promise.all([
      resolveLocalCheckout(repo, localDirLookup),
      discoverPlans(project.id, repo.id, shortName, repoStoreDir),
      discoverReviews(project.id, repo.id, shortName, repoStoreDir),
    ])

    repoRows.push({
      id: repo.id,
      slug: repo.slug,
      shortName,
      url: repo.url,
      localPath: resolvedLocalPath,
    })

    plans.push(...repoPlans)
    reviews.push(...repoReviews)
  }

  plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  reviews.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const activeStatuses = new Set(['queued', 'running', 'blocked'])
  const activeFlows = projectRuns.filter((r) => activeStatuses.has(r.status)).length

  return {
    id: project.id,
    name: project.name,
    repositories: repoRows,
    plans,
    reviews,
    counts: {
      repositories: repoRows.length,
      plans: plans.length,
      reviews: reviews.length,
      flows: projectRuns.length,
      activeFlows,
    },
  }
}

function formatShortRepoName(repo: Repository): string {
  const parts = repo.slug.split('--').filter(Boolean)
  if (parts.length >= 3) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  }
  return parts.at(-1) ?? repo.slug
}

async function buildFallbackProjectsDirLookup(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (process.env.DIFFLAB_HOME) return map

  const userProjectsDir = join(homedir(), 'Projects')
  const entries = await readdir(userProjectsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isDirectory()) {
      map.set(entry.name.toLowerCase(), join(userProjectsDir, entry.name))
    }
  }

  // Prefer the currently running workspace checkout when serving from a monorepo worktree.
  const candidateWorkspaceRoot = resolve(process.cwd(), '../..')
  const premiseRaw = await readFile(join(candidateWorkspaceRoot, 'premise.yaml'), 'utf8').catch(
    () => '',
  )
  if (premiseRaw.trim()) {
    try {
      const parsed = parseYaml(premiseRaw) as { workspace?: { name?: string } }
      const workspaceName = parsed?.workspace?.name?.trim().toLowerCase()
      if (workspaceName) {
        map.set(workspaceName, candidateWorkspaceRoot)
      }
    } catch {
      // Ignore non-standard premise.yaml.
    }
  }

  return map
}

async function resolveLocalCheckout(
  repo: Repository,
  localDirLookup: Map<string, string>,
): Promise<string | null> {
  if (repo.localPath && (await isDirectory(repo.localPath))) {
    return repo.localPath
  }
  if (process.env.DIFFLAB_HOME) return null

  const repoLeaf = (repo.slug.split('--').at(-1) ?? '').toLowerCase()
  if (!repoLeaf) return null

  const candidate = localDirLookup.get(repoLeaf)
  if (candidate && (await isDirectory(candidate))) {
    return candidate
  }
  return null
}

function normalizePlanStatus(rawStatus: string | undefined): string {
  if (!rawStatus) return 'draft'
  const stripped = rawStatus.replace(/\(.*$/, '').trim().toLowerCase()
  if (stripped === 'complete' || stripped === 'completed' || stripped === 'done') {
    return 'completed'
  }
  if (stripped.startsWith('in progress') || stripped === 'in_progress' || stripped === 'active') {
    return 'in progress'
  }
  if (stripped.startsWith('blocked')) {
    return 'blocked'
  }
  if (stripped.startsWith('draft')) {
    return 'draft'
  }
  return stripped.slice(0, 18) || 'draft'
}

async function discoverPlans(
  projectId: string,
  repoId: string,
  repoShortName: string,
  repoStoreDir: string,
): Promise<WorkspacePlanItem[]> {
  const plansDir = join(repoStoreDir, 'plans')
  const entries = await readdir(plansDir, { withFileTypes: true }).catch(() => [])
  const items: WorkspacePlanItem[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const planDir = join(plansDir, entry.name)
    const planMdPath = join(planDir, 'PLAN.md')
    const stat = await lstat(planMdPath).catch(() => null)
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) continue

    const raw = await readFile(planMdPath, 'utf8').catch(() => '')
    if (!raw.trim()) continue

    const revisions = await readdir(join(planDir, 'revisions')).catch(() => [])
    const revisionCount = revisions.filter((f) => f.endsWith('.md')).length

    const title = HEADING_REGEX.exec(raw)?.[1]?.trim() ?? entry.name
    const status = normalizePlanStatus(STATUS_META_REGEX.exec(raw)?.[1])
    const branch = normalizeOptionalMeta(BRANCH_META_REGEX.exec(raw)?.[1])

    items.push({
      id: `${repoId}:${entry.name}`,
      projectId,
      repoId,
      repoShortName,
      title,
      status,
      branch,
      revisionCount,
      summary: extractSectionSummary(raw, 'Intent') || entry.name,
      markdown: raw.slice(0, MAX_MARKDOWN_CHARS),
      updatedAt: stat.mtime.toISOString(),
    })
  }

  return items
}

async function discoverReviews(
  projectId: string,
  repoId: string,
  repoShortName: string,
  repoStoreDir: string,
): Promise<WorkspaceReviewItem[]> {
  const reviewsDir = join(repoStoreDir, 'reviews')
  const entries = await readdir(reviewsDir, { withFileTypes: true }).catch(() => [])
  const items: WorkspaceReviewItem[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const reviewDir = join(reviewsDir, entry.name)
    const reviewMdPath = join(reviewDir, 'REVIEW.md')
    const stat = await lstat(reviewMdPath).catch(() => null)
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) continue

    const raw = await readFile(reviewMdPath, 'utf8').catch(() => '')
    if (!raw.trim()) continue

    const hasRubric = await isRegularFile(join(reviewDir, 'rubric.yaml'))
    const rawTitle = HEADING_REGEX.exec(raw)?.[1]?.trim() ?? entry.name
    const title = rawTitle.replace(/^Review:\s*/i, '')
    const revision = normalizeOptionalMeta(REVISION_META_REGEX.exec(raw)?.[1])
    const mode = normalizeOptionalMeta(MODE_META_REGEX.exec(raw)?.[1])
    const intentMeta = normalizeOptionalMeta(INTENT_META_REGEX.exec(raw)?.[1])
    const status = /##\s+Intent Delivery/i.test(raw) ? 'completed' : 'in progress'

    items.push({
      id: `${repoId}:${entry.name}`,
      projectId,
      repoId,
      repoShortName,
      title,
      status,
      revision,
      mode,
      hasRubric,
      summary: intentMeta ?? extractSectionSummary(raw, 'Intent Delivery') ?? entry.name,
      markdown: raw.slice(0, MAX_MARKDOWN_CHARS),
      updatedAt: stat.mtime.toISOString(),
    })
  }

  return items
}

function normalizeOptionalMeta(value: string | undefined): string | null {
  if (!value) return null
  const cleaned = value.trim().replace(/^`|`$/g, '')
  if (!cleaned || cleaned.toLowerCase() === 'none') return null
  return cleaned
}

function extractSectionSummary(markdown: string, heading: string): string {
  const regex = new RegExp(`^##\\s+${heading}\\s*$`, 'im')
  const match = regex.exec(markdown)
  if (!match) return ''
  const after = markdown.slice(match.index + match[0].length)
  const nextSection = after.search(/^##\s+/m)
  const block = (nextSection === -1 ? after : after.slice(0, nextSection)).trim()
  const firstLine = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('```') && !l.startsWith('|'))
  if (!firstLine) return ''
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine
}

async function isDirectory(path: string): Promise<boolean> {
  const st = await lstat(path).catch(() => null)
  return Boolean(st && !st.isSymbolicLink() && st.isDirectory())
}

async function isRegularFile(path: string): Promise<boolean> {
  const st = await lstat(path).catch(() => null)
  return Boolean(st && !st.isSymbolicLink() && st.isFile())
}
