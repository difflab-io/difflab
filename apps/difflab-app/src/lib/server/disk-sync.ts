import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RunStatus, StepStatus, WorkerMessageLevel } from 'difflab-db'
import { getAppDb, resolveStorePaths } from './db.js'

// Constants -------------------------------------------------------------------
const FLOW_TITLE_REGEX = /^#\s+Flow run:\s*(.+)$/im
const STATUS_LINE_REGEX = /^-\s+\*\*Status:\*\*\s*(.+)$/im
const REPO_LINE_REGEX = /^-\s+\*\*Repository:\*\*\s*(.+)$/im
const STEP_HEADER_REGEX = /^-\s+\[([ xX])\]\s+(\d+)\.\s+([a-z0-9-]+)(?:\s+[—-]\s+(.+))?$/
const HANDOFF_LINE_REGEX = /^\s+-\s+Result\/handoff:\s*(.+)$/i
const SHA40_REGEX = /\b([0-9a-f]{40})\b/i
const LOG_LINE_REGEX = /^\[(\d{6})\s+(\d{2}:\d{2}:\d{2})\]:\s*(.+)$/
const STEP_LOG_REGEX = /^Step\s+\d+\s+(started|complete|failed):\s+([a-z0-9-]+)/i

// API -------------------------------------------------------------------------
/** Imports historical or interactive FLOW.md instances from ~/.difflab/projects into SQLite. */
export async function syncDiskFlowRunsToDb(): Promise<Record<string, string>> {
  const db = await getAppDb()
  const paths = resolveStorePaths()
  const [repos, existingRuns] = await Promise.all([
    db.repositories.listRepositories(),
    db.runs.listRuns(),
  ])

  const repoLabels: Record<string, string> = {}
  for (const repo of repos) {
    const shortRepo = repo.slug.split('--').at(-1) ?? repo.slug
    repoLabels[repo.id] = `${repo.projectId} / ${shortRepo}`
  }

  const knownStoreDirs = new Set(existingRuns.map((r) => r.storeFlowDir))
  const knownRunIds = new Set(existingRuns.map((r) => r.id))

  for (const repo of repos) {
    const repoFlowsDir = join(paths.projects, repo.projectId, repo.slug, 'flows')
    const entries = await readdir(repoFlowsDir, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const storeFlowDir = join(repoFlowsDir, entry.name)
      if (knownStoreDirs.has(storeFlowDir)) continue

      const flowMdPath = join(storeFlowDir, 'FLOW.md')
      const flowStat = await lstat(flowMdPath).catch(() => null)
      if (!flowStat || flowStat.isSymbolicLink() || !flowStat.isFile()) continue

      const rawFlow = await readFile(flowMdPath, 'utf8').catch(() => '')
      if (!rawFlow.trim()) continue

      const parsed = parseHistoricalFlowMd(rawFlow, entry.name)
      const rawLogs = await readFile(join(storeFlowDir, 'logs.txt'), 'utf8').catch(() => '')
      const parsedLogs = parseHistoricalLogs(rawLogs, flowStat.mtime)

      const createdAt =
        parsedLogs[0]?.createdAt ??
        inferTimestampFromRunDir(entry.name, flowStat.birthtime, flowStat.mtime)
      const updatedAt = parsedLogs.at(-1)?.createdAt ?? flowStat.mtime.toISOString()

      const shortRepo = repo.slug.split('--').at(-1) ?? repo.projectId.toLowerCase()
      const candidateId = !knownRunIds.has(entry.name) ? entry.name : `${shortRepo}:${entry.name}`
      knownRunIds.add(candidateId)
      knownStoreDirs.add(storeFlowDir)

      await db.runs
        .createRun({
          id: candidateId,
          repoId: repo.id,
          flowName: parsed.flowName,
          status: parsed.status,
          harness: 'agy',
          storeFlowDir,
          worktreePath: parsed.repositoryPath,
          commitSha: parsed.commitSha,
          createdAt,
          updatedAt,
          steps: parsed.steps,
          messages: parsedLogs,
        })
        .catch(() => undefined)
    }
  }

  return repoLabels
}

// Helpers ---------------------------------------------------------------------
function parseHistoricalFlowMd(
  markdown: string,
  fallbackDirName: string,
): {
  flowName: string
  status: RunStatus
  repositoryPath: string | null
  commitSha: string | null
  steps: { seq: number; stepId: string; status: StepStatus; handoff: string | null }[]
} {
  const rawName = FLOW_TITLE_REGEX.exec(markdown)?.[1]?.trim()
  const flowName = rawName || fallbackDirName.replace(/^\d{6}-/, '')
  const rawStatus = STATUS_LINE_REGEX.exec(markdown)?.[1]?.trim().toLowerCase() ?? 'completed'
  const status: RunStatus =
    rawStatus === 'completed' || rawStatus === 'done'
      ? 'done'
      : rawStatus === 'blocked'
        ? 'blocked'
        : rawStatus === 'failed'
          ? 'failed'
          : 'running'

  const repositoryPath = REPO_LINE_REGEX.exec(markdown)?.[1]?.trim() ?? null

  const stepsMatch = /^##\s+Steps\s*$/m.exec(markdown)
  const steps: { seq: number; stepId: string; status: StepStatus; handoff: string | null }[] = []
  if (stepsMatch) {
    const afterSteps = markdown.slice(stepsMatch.index + stepsMatch[0].length)
    const nextHeading = afterSteps.search(/^##\s+/m)
    const block = nextHeading === -1 ? afterSteps : afterSteps.slice(0, nextHeading)
    let current: {
      seq: number
      stepId: string
      status: StepStatus
      handoff: string | null
    } | null = null

    for (const line of block.split(/\r?\n/)) {
      const header = STEP_HEADER_REGEX.exec(line)
      if (header) {
        if (current) steps.push(current)
        const checked = header[1]?.toLowerCase() === 'x'
        current = {
          seq: Number(header[2]),
          stepId: header[3]!,
          status: checked
            ? 'done'
            : status === 'blocked' || status === 'failed'
              ? 'failed'
              : 'pending',
          handoff: null,
        }
        continue
      }
      if (current) {
        const handoff = HANDOFF_LINE_REGEX.exec(line)?.[1]?.trim()
        if (handoff !== undefined) {
          current.handoff = !handoff || /^pending$/i.test(handoff) ? null : handoff
        }
      }
    }
    if (current) steps.push(current)
  }

  let commitSha: string | null = null
  for (let i = steps.length - 1; i >= 0; i--) {
    const handoff = steps[i]?.handoff
    if (!handoff) continue
    const headMatch = /head_sha[=`:\s"]+([0-9a-f]{40})/i.exec(handoff) ?? SHA40_REGEX.exec(handoff)
    if (headMatch?.[1]) {
      commitSha = headMatch[1]
      break
    }
  }

  return { flowName, status, repositoryPath, commitSha, steps }
}

function parseHistoricalLogs(
  rawLogs: string,
  fallbackDate: Date,
): { stepId: string | null; level: WorkerMessageLevel; text: string; createdAt: string }[] {
  if (!rawLogs.trim()) return []
  return rawLogs
    .trimEnd()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = LOG_LINE_REGEX.exec(line.trim())
      const text = match?.[3]?.trim() ?? line.trim()
      const createdAt =
        match?.[1] && match?.[2]
          ? parseCompactTimestamp(match[1], match[2], fallbackDate)
          : fallbackDate.toISOString()
      const stepMatch = STEP_LOG_REGEX.exec(text)
      const phase = stepMatch?.[1]?.toLowerCase()
      const stepId = stepMatch?.[2] ?? null
      const level: WorkerMessageLevel =
        phase === 'complete' ? 'done' : phase === 'failed' ? 'error' : 'info'
      return { stepId, level, text, createdAt }
    })
}

function parseCompactTimestamp(yymmdd: string, hhmmss: string, fallback: Date): string {
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))
  const [hh, min, sec] = hhmmss.split(':').map(Number)
  const parsed = new Date(2000 + yy, mm - 1, dd, hh ?? 0, min ?? 0, sec ?? 0)
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString()
}

function inferTimestampFromRunDir(dirName: string, birthtime: Date, mtime: Date): string {
  const m = /^(\d{2})(\d{2})(\d{2})-/.exec(dirName)
  if (m) {
    const d = new Date(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return (birthtime.getTime() > 0 ? birthtime : mtime).toISOString()
}
