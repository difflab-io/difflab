import { lstat, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { FlowRun, Project, Repository } from 'difflab-db'
import type { ComponentTaxonomyKind, RepoComponentNode, RepositoryGraphRow } from 'ui'
import { getAppDb, resolveStorePaths } from './db.js'

// Constants -------------------------------------------------------------------
const MAX_MARKDOWN_CHARS = 48_000
const MAX_DOCS_PER_REPO = 24
const HEADING_REGEX = /^#\s+(.+)$/m
const STATUS_META_REGEX = /^-\s+\*\*Status:\*\*\s*(.+)$/im
const BRANCH_META_REGEX = /^-\s+\*\*Branch:\*\*\s*(.+)$/im
const ISSUE_META_REGEX = /^-\s+\*\*Issue:\*\*\s*(.+)$/im
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
  issue: string | null
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

export interface WorkspaceDocItem {
  id: string
  projectId: string
  repoId: string
  repoShortName: string
  category: 'PRD' | 'ADR' | 'Docs' | 'Overview'
  relativePath: string
  title: string
  markdown: string
  updatedAt: string
}

export interface RepoTriggerBinding {
  repoId: string
  repoShortName: string
  flowName: string
  team: string | null
  labels: string[]
  assignee: string | null
  defaultHarness: string
}

export interface ProjectWorkspaceData {
  id: string
  name: string
  repositories: RepositoryGraphRow[]
  plans: WorkspacePlanItem[]
  reviews: WorkspaceReviewItem[]
  docs: WorkspaceDocItem[]
  triggers: RepoTriggerBinding[]
  counts: {
    repositories: number
    apps: number
    libraries: number
    plans: number
    reviews: number
    docs: number
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
  const repoRows: RepositoryGraphRow[] = []
  const plans: WorkspacePlanItem[] = []
  const reviews: WorkspaceReviewItem[] = []
  const docs: WorkspaceDocItem[] = []
  const triggers: RepoTriggerBinding[] = []

  for (const repo of repos) {
    const shortName = formatShortRepoName(repo)
    const resolvedLocalPath = await resolveLocalCheckout(repo, localDirLookup)

    const [repoDocs, components, repoTriggers, repoPlans, repoReviews] = await Promise.all([
      resolvedLocalPath
        ? discoverRepoDocs(project.id, repo.id, shortName, resolvedLocalPath)
        : Promise.resolve([]),
      resolvedLocalPath ? discoverRepoComponents(resolvedLocalPath) : Promise.resolve([]),
      resolvedLocalPath
        ? discoverRepoTriggers(repo.id, shortName, resolvedLocalPath)
        : Promise.resolve([]),
      discoverPlans(project.id, repo.id, shortName, join(projectsStoreRoot, project.id, repo.slug)),
      discoverReviews(
        project.id,
        repo.id,
        shortName,
        join(projectsStoreRoot, project.id, repo.slug),
      ),
    ])

    repoRows.push({
      id: repo.id,
      slug: repo.slug,
      shortName,
      url: repo.url,
      localPath: resolvedLocalPath,
      docCount: repoDocs.length,
      components,
    })

    docs.push(...repoDocs)
    triggers.push(...repoTriggers)
    plans.push(...repoPlans)
    reviews.push(...repoReviews)
  }

  plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  reviews.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  docs.sort((a, b) => {
    const order = { PRD: 0, ADR: 1, Docs: 2, Overview: 3 }
    if (order[a.category] !== order[b.category]) return order[a.category] - order[b.category]
    return a.relativePath.localeCompare(b.relativePath)
  })

  let apps = 0
  let libraries = 0
  for (const row of repoRows) {
    for (const comp of row.components) {
      if (comp.kind === 'App') apps++
      else libraries++
    }
  }

  const activeStatuses = new Set(['queued', 'running', 'blocked'])
  const activeFlows = projectRuns.filter((r) => activeStatuses.has(r.status)).length

  return {
    id: project.id,
    name: project.name,
    repositories: repoRows,
    plans,
    reviews,
    docs,
    triggers,
    counts: {
      repositories: repoRows.length,
      apps,
      libraries,
      plans: plans.length,
      reviews: reviews.length,
      docs: docs.length,
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

async function discoverRepoComponents(repoRoot: string): Promise<RepoComponentNode[]> {
  const premisePath = join(repoRoot, 'premise.yaml')
  const premiseRaw = await readFile(premisePath, 'utf8').catch(() => '')
  const seen = new Set<string>()
  const nodes: RepoComponentNode[] = []

  if (premiseRaw.trim()) {
    try {
      const parsed = parseYaml(premiseRaw) as {
        workspace?: {
          projects?: { name?: string; path?: string; template?: string }[]
        }
      }
      for (const proj of parsed?.workspace?.projects ?? []) {
        if (!proj.name || !proj.path) continue
        const kind: ComponentTaxonomyKind =
          proj.path.startsWith('libs/') ||
          proj.path.startsWith('packages/') ||
          proj.template?.includes('lib')
            ? 'Library'
            : 'App'
        const hasDocs = await isRegularFile(join(repoRoot, proj.path, 'README.md'))
        seen.add(proj.path)
        nodes.push({
          name: proj.name,
          kind,
          path: proj.path,
          template: proj.template,
          hasDocs,
        })
      }
    } catch {
      // Ignore malformed premise.yaml and continue scanning directories.
    }
  }

  const buckets: { dir: string; kind: ComponentTaxonomyKind }[] = [
    { dir: 'apps', kind: 'App' },
    { dir: 'services', kind: 'App' },
    { dir: 'cmd', kind: 'App' },
    { dir: 'libs', kind: 'Library' },
    { dir: 'packages', kind: 'Library' },
    { dir: 'crates', kind: 'Library' },
  ]

  for (const bucket of buckets) {
    const bucketDir = join(repoRoot, bucket.dir)
    const entries = await readdir(bucketDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const relPath = `${bucket.dir}/${entry.name}`
      if (seen.has(relPath)) continue
      seen.add(relPath)
      const hasDocs = await isRegularFile(join(bucketDir, entry.name, 'README.md'))
      nodes.push({
        name: entry.name,
        kind: bucket.kind,
        path: relPath,
        hasDocs,
      })
    }
  }

  if (nodes.length === 0) {
    const pkgJsonRaw = await readFile(join(repoRoot, 'package.json'), 'utf8').catch(() => '')
    if (pkgJsonRaw.trim()) {
      try {
        const pkg = JSON.parse(pkgJsonRaw) as {
          name?: string
          bin?: unknown
          exports?: unknown
          dependencies?: Record<string, string>
        }
        if (pkg.name) {
          const isApp = Boolean(
            pkg.bin || pkg.dependencies?.['@sveltejs/kit'] || pkg.dependencies?.astro,
          )
          nodes.push({
            name: pkg.name,
            kind: isApp ? 'App' : 'Library',
            path: '.',
            hasDocs: await isRegularFile(join(repoRoot, 'README.md')),
          })
        }
      } catch {
        // Ignore non-standard package.json.
      }
    } else if (await isRegularFile(join(repoRoot, 'Cargo.toml'))) {
      const cargoRaw = await readFile(join(repoRoot, 'Cargo.toml'), 'utf8').catch(() => '')
      const nameMatch = /^\s*name\s*=\s*"([^"]+)"/m.exec(cargoRaw)
      const kind: ComponentTaxonomyKind = cargoRaw.includes('[[bin]]') ? 'App' : 'Library'
      nodes.push({
        name: nameMatch?.[1] ?? basename(repoRoot),
        kind,
        path: '.',
        hasDocs: await isRegularFile(join(repoRoot, 'README.md')),
      })
    } else if (await isRegularFile(join(repoRoot, 'go.mod'))) {
      nodes.push({
        name: basename(repoRoot),
        kind: 'Library',
        path: '.',
        hasDocs: await isRegularFile(join(repoRoot, 'README.md')),
      })
    }
  }

  return nodes
}

async function discoverRepoTriggers(
  repoId: string,
  repoShortName: string,
  repoRoot: string,
): Promise<RepoTriggerBinding[]> {
  const raw = await readFile(join(repoRoot, 'difflab.yaml'), 'utf8').catch(() => '')
  if (!raw.trim()) return []
  try {
    const parsed = parseYaml(raw) as {
      flows?: {
        defaultHarness?: string
        triggers?: {
          flow?: string
          team?: string
          labels?: string[]
          assignee?: string
          agent?: string
        }[]
      }
    }
    const defaultHarness = parsed?.flows?.defaultHarness ?? 'agy'
    const list: RepoTriggerBinding[] = []
    for (const trig of parsed?.flows?.triggers ?? []) {
      if (!trig.flow) continue
      list.push({
        repoId,
        repoShortName,
        flowName: trig.flow,
        team: trig.team ?? null,
        labels: Array.isArray(trig.labels) ? trig.labels : [],
        assignee: trig.assignee ?? trig.agent ?? null,
        defaultHarness,
      })
    }
    return list
  } catch {
    return []
  }
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
    const status = STATUS_META_REGEX.exec(raw)?.[1]?.trim() ?? 'draft'
    const branch = normalizeOptionalMeta(BRANCH_META_REGEX.exec(raw)?.[1])
    const issue = normalizeOptionalMeta(ISSUE_META_REGEX.exec(raw)?.[1])

    items.push({
      id: `${repoId}:${entry.name}`,
      projectId,
      repoId,
      repoShortName,
      title,
      status,
      branch,
      issue,
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

async function discoverRepoDocs(
  projectId: string,
  repoId: string,
  repoShortName: string,
  repoRoot: string,
): Promise<WorkspaceDocItem[]> {
  const candidates: { relPath: string; category: WorkspaceDocItem['category'] }[] = [
    { relPath: 'README.md', category: 'Overview' },
    { relPath: 'AGENTS.md', category: 'Overview' },
  ]

  const docFolders: { dir: string; category: WorkspaceDocItem['category'] }[] = [
    { dir: 'prd', category: 'PRD' },
    { dir: 'adr', category: 'ADR' },
    { dir: 'docs', category: 'Docs' },
  ]

  for (const folder of docFolders) {
    const absFolder = join(repoRoot, folder.dir)
    const entries = await readdir(absFolder, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (candidates.length >= MAX_DOCS_PER_REPO) break
      if (entry.isFile() && entry.name.endsWith('.md')) {
        candidates.push({ relPath: `${folder.dir}/${entry.name}`, category: folder.category })
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const nestedReadme = `${folder.dir}/${entry.name}/README.md`
        if (await isRegularFile(join(repoRoot, nestedReadme))) {
          candidates.push({ relPath: nestedReadme, category: folder.category })
        } else {
          const subEntries = await readdir(join(absFolder, entry.name), {
            withFileTypes: true,
          }).catch(() => [])
          for (const sub of subEntries) {
            if (candidates.length >= MAX_DOCS_PER_REPO) break
            if (sub.isFile() && sub.name.endsWith('.md')) {
              candidates.push({
                relPath: `${folder.dir}/${entry.name}/${sub.name}`,
                category: folder.category,
              })
            }
          }
        }
      }
    }
  }

  const docs: WorkspaceDocItem[] = []
  for (const cand of candidates.slice(0, MAX_DOCS_PER_REPO)) {
    const absPath = join(repoRoot, cand.relPath)
    const stat = await lstat(absPath).catch(() => null)
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) continue
    const raw = await readFile(absPath, 'utf8').catch(() => '')
    if (!raw.trim()) continue

    const title = HEADING_REGEX.exec(raw)?.[1]?.trim() ?? cand.relPath
    docs.push({
      id: `${repoId}:${cand.relPath}`,
      projectId,
      repoId,
      repoShortName,
      category: cand.category,
      relativePath: cand.relPath,
      title,
      markdown: raw.slice(0, MAX_MARKDOWN_CHARS),
      updatedAt: stat.mtime.toISOString(),
    })
  }

  return docs
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
