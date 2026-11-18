import { existsSync } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { harnessKindSchema, worktreeRetentionSchema, type HarnessKind } from 'difflab-db'
import {
  addPathToGitExcludes,
  createGitWorktree,
  discoverGitRepository,
  gitHeadSha,
  removeGitWorktree,
} from 'utils/gitx'
import { createHerdrClient } from 'utils/herdrx'
import { assertMiseConfig } from 'utils/misex'
import { z } from 'zod'
import { parseFrozenFlowInstance } from '../flows/flow-markdown.js'
import { appendProgressLog } from '../logs/store.js'
import { ensureRepoStore } from '../projects/repo-store.js'
import { userPaths } from '../store/user-store.js'

// Constants -------------------------------------------------------------------
const rigExecuteSchema = z.object({
  runId: z.string().min(1),
  repoId: z.string().min(1),
  repoRoot: z.string().min(1),
  projectKey: z.string().min(1),
  repoSlug: z.string().min(1),
  storeFlowDir: z.string().min(1),
  flowName: z.string().min(1),
  definitionPath: z.string().min(1),
  inputs: z.record(z.string(), z.string()),
  flags: z.array(z.string()),
  harness: harnessKindSchema,
  appUrl: z.string().url(),
  retention: worktreeRetentionSchema,
})

const rigCleanupSchema = z.object({
  runId: z.string().min(1),
  repoRoot: z.string().min(1),
  worktreePath: z.string().nullable(),
  retention: worktreeRetentionSchema,
  finalStatus: z.string().min(1),
})

// Types -----------------------------------------------------------------------
export type RigServerOptions = {
  port?: number
  hostname?: string
  home?: string
  herdrSession?: string
  herdrBin?: string
}

export type PreloadRigContextInput = {
  worktreePath: string
  repoRoot: string
  difflabHome: string
  storeRoot: string
  appUrl?: string
  runId?: string
}

type FlowResultFile = {
  status?: 'done' | 'blocked' | 'failed'
  commitSha?: string
  summary?: string
}

// API -------------------------------------------------------------------------
export function startRigServer(options: RigServerOptions = {}) {
  const herdrSession = options.herdrSession ?? process.env.DIFFLAB_HERDR_SESSION
  const herdrBin = options.herdrBin ?? process.env.DIFFLAB_HERDR_BIN
  const runQueues = new Map<string, Promise<void>>()

  const enqueueForRun = (runId: string, task: () => Promise<void>) => {
    const previous = runQueues.get(runId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(task)
    runQueues.set(runId, next)
  }

  const server = Bun.serve({
    port: options.port ?? 4319,
    hostname: options.hostname ?? '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url)

      if (req.method === 'GET' && url.pathname === '/health') {
        return Response.json({
          ok: true,
          herdrSession: herdrSession ?? null,
        })
      }

      if (req.method === 'POST' && url.pathname === '/v1/rig/execute') {
        let rawBody: unknown
        try {
          rawBody = await req.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const parsed = rigExecuteSchema.safeParse(rawBody)
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Invalid execute payload' },
            { status: 400 },
          )
        }

        enqueueForRun(parsed.data.runId, () =>
          executeRigFlow(parsed.data, {
            home: options.home,
            herdrSession,
            herdrBin,
          }),
        )
        return Response.json({ accepted: true }, { status: 202 })
      }

      if (req.method === 'POST' && url.pathname === '/v1/rig/cleanup') {
        let rawBody: unknown
        try {
          rawBody = await req.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const parsed = rigCleanupSchema.safeParse(rawBody)
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Invalid cleanup payload' },
            { status: 400 },
          )
        }

        const shouldRemove =
          parsed.data.retention === 'always' ||
          (parsed.data.retention === 'on-success' && parsed.data.finalStatus === 'done')

        let removed = false
        if (shouldRemove && parsed.data.worktreePath) {
          try {
            removeGitWorktree(parsed.data.repoRoot, parsed.data.worktreePath)
            removed = true
          } catch {
            removed = false
          }
        }
        runQueues.delete(parsed.data.runId)
        return Response.json({ removed })
      }

      return Response.json({ error: 'Not found' }, { status: 404 })
    },
  })

  return server
}

export async function preloadAgentWorktreeContext(
  input: PreloadRigContextInput,
): Promise<{ rigBinDir: string; cliEntry: string }> {
  const workspaceRoot = resolveWorkspaceRoot()
  const cliEntry = resolveCliEntrypoint(workspaceRoot)
  const skillsDir = join(workspaceRoot, 'skills')
  const wtGit = discoverGitRepository(input.worktreePath)

  await addPathToGitExcludes(wtGit.excludePath, '/.agents')

  const agentsDir = join(input.worktreePath, '.agents')
  const pluginDir = join(agentsDir, 'plugins', 'difflab-rig')
  const rulesDir = join(pluginDir, 'rules')
  await mkdir(rulesDir, { recursive: true })

  await writeFile(
    join(agentsDir, 'skills.json'),
    JSON.stringify({ entries: [{ path: skillsDir }] }, null, 2),
    'utf8',
  )

  await writeFile(join(pluginDir, 'plugin.json'), JSON.stringify({ name: 'difflab-rig' }, null, 2))

  const mcpEnv: Record<string, string> = {
    DIFFLAB_HOME_ROOT: input.difflabHome,
    DIFFLAB_STORE_DIR: input.storeRoot,
  }
  if (input.appUrl) mcpEnv.DIFFLAB_APP_URL = input.appUrl
  if (input.runId) mcpEnv.DIFFLAB_RUN_ID = input.runId

  await writeFile(
    join(pluginDir, 'mcp_config.json'),
    JSON.stringify(
      {
        mcpServers: {
          difflab: {
            command: process.execPath,
            args: [cliEntry, 'mcp', 'serve'],
            env: mcpEnv,
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  )

  await writeFile(
    join(rulesDir, 'AGENTS.md'),
    [
      '# Difflab Rig Execution Rules',
      '',
      '- Use MCP server `difflab-rig_difflab` (when present) for Difflab MCP tools (`project_context`, `template_list`, `scaffold`, `log_append`, `flow_state_update`) so calls target this run store and live SSE stream.',
      '- Do not add AI attributions, model names, `Generated via` footers, or AI `Co-authored-by` trailers to commits, pull requests, review files, or comments.',
      '',
    ].join('\n'),
    'utf8',
  )

  const rigBinDir = join(input.storeRoot, 'bin')
  await mkdir(rigBinDir, { recursive: true, mode: 0o700 })
  const difflabShim = join(rigBinDir, 'difflab')
  await writeFile(
    difflabShim,
    [
      '#!/bin/sh',
      `export DIFFLAB_HOME_ROOT="\${DIFFLAB_HOME_ROOT:-${shellQuote(input.difflabHome)}}"`,
      `export DIFFLAB_STORE_DIR="\${DIFFLAB_STORE_DIR:-${shellQuote(input.storeRoot)}}"`,
      ...(input.appUrl
        ? [`export DIFFLAB_APP_URL="\${DIFFLAB_APP_URL:-${shellQuote(input.appUrl)}}"`]
        : []),
      ...(input.runId
        ? [`export DIFFLAB_RUN_ID="\${DIFFLAB_RUN_ID:-${shellQuote(input.runId)}}"`]
        : []),
      `exec ${shellQuote(process.execPath)} ${shellQuote(cliEntry)} "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  )

  return { rigBinDir, cliEntry }
}

export function buildHarnessStartArgs(harness: HarnessKind, trustedWorkspaces: string[]): string[] {
  if (harness === 'agy') {
    const inlineSettings = JSON.stringify({
      trustedWorkspaces,
      allowNonWorkspaceAccess: true,
    })
    return ['--dangerously-skip-permissions', '--settings', inlineSettings]
  }
  if (harness === 'claude') {
    return ['--dangerously-skip-permissions']
  }
  return []
}

// Helpers ---------------------------------------------------------------------
async function executeRigFlow(
  payload: z.infer<typeof rigExecuteSchema>,
  ctx: {
    home?: string
    herdrSession?: string
    herdrBin?: string
  },
): Promise<void> {
  const effectiveDifflabHome =
    ctx.home ?? process.env.DIFFLAB_HOME_ROOT ?? process.env.HOME ?? homedir()
  const paths = userPaths(effectiveDifflabHome)
  const flowMdPath = join(payload.storeFlowDir, 'FLOW.md')
  const logsPath = join(payload.storeFlowDir, 'logs.txt')
  const runStartedAtMs = Date.now()

  await mkdir(payload.storeFlowDir, { recursive: true, mode: 0o700 })

  try {
    await assertMiseConfig(payload.repoRoot)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await writeFallbackBlockerFlow(flowMdPath, payload, reason)
    await appendProgressLog(logsPath, `Blocked before flow ${payload.flowName}: ${reason}`)
    await postStateCallback(payload.appUrl, payload.runId, {
      status: 'failed',
      message: {
        level: 'blocker',
        text: reason,
      },
    })
    return
  }

  const herdr = createHerdrClient({
    bin: ctx.herdrBin,
    session: ctx.herdrSession,
  })

  let paneId: string | null = null
  let stopWatcher: (() => void) | null = null

  try {
    await mkdir(paths.worktrees, { recursive: true, mode: 0o700 })
    const worktreeCandidate = join(paths.worktrees, payload.runId)
    const exists = await lstat(worktreeCandidate).catch(() => null)
    const worktreePath = exists
      ? worktreeCandidate
      : createGitWorktree(payload.repoRoot, worktreeCandidate, `flow/${payload.runId}`, 'HEAD')

    const wtGit = discoverGitRepository(worktreePath)
    const repoStoreTarget = join(paths.projects, payload.projectKey, payload.repoSlug)
    await ensureRepoStore(worktreePath, repoStoreTarget, wtGit.excludePath)

    // Ensure uncommitted difflab.yaml in repoRoot is available in the worktree without dirtying git status.
    const wtConfigPath = join(worktreePath, 'difflab.yaml')
    const rootConfigPath = join(payload.repoRoot, 'difflab.yaml')
    if (!existsSync(wtConfigPath) && existsSync(rootConfigPath)) {
      await addPathToGitExcludes(wtGit.excludePath, '/difflab.yaml')
      await copyFile(rootConfigPath, wtConfigPath)
    }

    const { rigBinDir } = await preloadAgentWorktreeContext({
      worktreePath,
      repoRoot: payload.repoRoot,
      difflabHome: effectiveDifflabHome,
      storeRoot: paths.root,
      appUrl: payload.appUrl,
      runId: payload.runId,
    })

    const trustedWorkspaces = [worktreePath, payload.repoRoot, paths.root, effectiveDifflabHome]
    await writeHarnessSettings(payload, worktreePath, trustedWorkspaces, effectiveDifflabHome)

    const mergedPath = `${rigBinDir}:${process.env.PATH ?? ''}`
    const envVars: Record<string, string> = {
      PATH: mergedPath,
      DIFFLAB_HOME_ROOT: effectiveDifflabHome,
      DIFFLAB_STORE_DIR: paths.root,
      DIFFLAB_RUN_ID: payload.runId,
      DIFFLAB_APP_URL: payload.appUrl,
      DIFFLAB_WORKTREE_PATH: worktreePath,
      DIFFLAB_STORE_FLOW_DIR: payload.storeFlowDir,
      MISE_TRUSTED_CONFIG_PATHS: `${worktreePath}:${payload.repoRoot}`,
    }
    if (ctx.home) {
      envVars.HOME = ctx.home
    }

    const label = `flow:${payload.runId}`
    await herdr.ensureServer()
    let createdTab: { tabId: string; paneId: string; workspaceId?: string }
    try {
      createdTab = await herdr.createTab(worktreePath, label, { env: envVars })
    } catch {
      createdTab = await herdr.ensureWorkspace(worktreePath, label, envVars)
    }

    paneId = createdTab.paneId
    const safeSuffix = payload.runId
      .replace(/[^a-z0-9_-]/gi, '-')
      .toLowerCase()
      .slice(-24)
    const agentName = `dl-${safeSuffix}`.slice(0, 32)

    await herdr
      .reportPaneMetadata(paneId, {
        title: `flow:${payload.flowName}`,
        displayAgent: payload.harness,
        stateLabel: 'running',
        tokens: {
          run: payload.runId,
          flow: payload.flowName,
        },
      })
      .catch(() => undefined)

    await postStateCallback(payload.appUrl, payload.runId, {
      status: 'running',
      worktreePath,
      herdrSession: herdr.session,
      herdrPaneId: paneId,
      herdrAgentName: agentName,
      message: {
        level: 'info',
        text: `Starting /difflab-flow go ${payload.flowName} (${payload.harness}) in Herdr pane ${paneId}`,
      },
    })

    stopWatcher = startFrozenFlowWatcher({
      payload,
      flowsRoot: join(paths.projects, payload.projectKey, payload.repoSlug, 'flows'),
      runStartedAtMs,
    })

    const requestFile = join(payload.storeFlowDir, 'flow-request.json')
    const resultFile = join(payload.storeFlowDir, 'flow-result.json')
    await writeFile(
      requestFile,
      JSON.stringify(
        {
          runId: payload.runId,
          flowName: payload.flowName,
          definitionPath: payload.definitionPath,
          projectKey: payload.projectKey,
          repoSlug: payload.repoSlug,
          repoRoot: payload.repoRoot,
          worktreePath,
          storeFlowDir: payload.storeFlowDir,
          flowMdPath,
          logsPath,
          appUrl: payload.appUrl,
          difflabHome: effectiveDifflabHome,
          inputs: payload.inputs,
          flags: payload.flags,
          harness: payload.harness,
        },
        null,
        2,
      ),
      'utf8',
    )

    const customHarnessCmd = process.env.DIFFLAB_HARNESS_CMD?.trim()
    if (payload.harness === 'mock') {
      if (!customHarnessCmd) {
        throw new Error('Harness kind `mock` requires DIFFLAB_HARNESS_CMD to be configured')
      }
      const tokenCore = `${payload.runId}_flow_`
      const sentinelMatch = `__DIFFLAB_EXIT_${tokenCore}:`
      const envExports = Object.entries(envVars)
        .map(([k, v]) => `${k}=${shellQuote(v)}`)
        .join(' ')

      // Short launcher script keeps PTY command well below macOS 1024-byte MAX_CANON.
      const scriptPath = join(paths.worktrees, `${payload.runId}-flow.sh`)
      await writeFile(
        scriptPath,
        [
          '#!/bin/sh',
          `cd ${shellQuote(worktreePath)} || exit 1`,
          `export ${envExports}`,
          `mise exec -- ${customHarnessCmd} ${shellQuote(requestFile)} ${shellQuote(resultFile)}`,
          'rc=$?',
          `printf '\\n%s%s:%d\\n' '__DIFFLAB_EXIT_' ${shellQuote(tokenCore)} "$rc"`,
          '',
        ].join('\n'),
        { mode: 0o700 },
      )

      try {
        await herdr.runInPane(paneId, `sh ${shellQuote(scriptPath)}`)
        const waitSnapshot = await herdr.waitPaneOutput(paneId, sentinelMatch, 180_000)
        const paneSnapshot = waitSnapshot.includes(sentinelMatch)
          ? waitSnapshot
          : await herdr.readPane(paneId, 200)
        const exitCode = extractExitCode(paneSnapshot, sentinelMatch)
        if (exitCode !== 0) {
          throw new Error(`Flow ${payload.flowName} exited with status ${exitCode}`)
        }
      } finally {
        await rm(scriptPath, { force: true }).catch(() => undefined)
      }
    } else {
      const startArgs = buildHarnessStartArgs(payload.harness, trustedWorkspaces)
      await herdr.startAgent(agentName, payload.harness, paneId, startArgs)
      const prompt = buildFlowGoPrompt(payload, worktreePath, flowMdPath, logsPath)
      await herdr.promptAgent(agentName, prompt, 2_400_000)
    }

    stopWatcher()
    stopWatcher = null

    // Reconcile final FLOW.md + logs.txt (including mirroring if the agent chose YYMMDD-<name>).
    const actualFlowDir = await reconcileFlowArtifactsDir(
      payload,
      join(paths.projects, payload.projectKey, payload.repoSlug, 'flows'),
      runStartedAtMs,
    )
    const finalFlowRaw = await readFile(join(actualFlowDir, 'FLOW.md'), 'utf8').catch(() => '')
    if (!finalFlowRaw.trim()) {
      throw new Error(
        `Agent finished without scaffolding frozen FLOW.md in ${payload.storeFlowDir}`,
      )
    }

    const parsedFinal = parseFrozenFlowInstance(finalFlowRaw)
    const resultMeta = await readFlowResult(resultFile)
    const headSha = safeHeadSha(worktreePath)
    const finalStatus = resultMeta.status ?? parsedFinal.runStatus
    const terminalStatus =
      finalStatus === 'done' || finalStatus === 'blocked' || finalStatus === 'failed'
        ? finalStatus
        : parsedFinal.steps.length > 0 && parsedFinal.steps.every((s) => s.status === 'done')
          ? 'done'
          : 'failed'

    await herdr
      .reportPaneMetadata(paneId, {
        title: `flow:${payload.flowName}`,
        displayAgent: payload.harness,
        stateLabel: terminalStatus,
        tokens: {
          run: payload.runId,
          flow: payload.flowName,
        },
      })
      .catch(() => undefined)

    const summaryText =
      terminalStatus === 'done'
        ? (resultMeta.summary ??
          `Completed flow ${payload.flowName} (${parsedFinal.steps.length} steps)`)
        : (parsedFinal.blocker ??
          resultMeta.summary ??
          `Flow ${payload.flowName} ${terminalStatus}`)

    await postStateCallback(payload.appUrl, payload.runId, {
      status: terminalStatus,
      ...(headSha || resultMeta.commitSha ? { commitSha: resultMeta.commitSha ?? headSha } : {}),
      ...(parsedFinal.steps.length
        ? {
            steps: parsedFinal.steps.map((s) => ({
              ...s,
              harness: payload.harness,
            })),
          }
        : {}),
      message: {
        level:
          terminalStatus === 'done' ? 'done' : terminalStatus === 'blocked' ? 'blocker' : 'error',
        text: summaryText,
      },
    })
  } catch (error) {
    stopWatcher?.()
    const reason = error instanceof Error ? error.message : String(error)
    await recordOrWriteBlocker(flowMdPath, payload, reason)
    await appendProgressLog(logsPath, `Flow ${payload.flowName} failed: ${reason}`).catch(
      () => undefined,
    )
    if (paneId) {
      await herdr
        .reportPaneMetadata(paneId, {
          title: `flow:${payload.flowName}`,
          displayAgent: payload.harness,
          stateLabel: 'failed',
          tokens: { run: payload.runId, flow: payload.flowName },
        })
        .catch(() => undefined)
    }
    await postStateCallback(payload.appUrl, payload.runId, {
      status: 'failed',
      message: {
        level: 'error',
        text: reason,
      },
    })
  }
}

function startFrozenFlowWatcher(options: {
  payload: z.infer<typeof rigExecuteSchema>
  flowsRoot: string
  runStartedAtMs: number
}): () => void {
  let stopped = false
  let lastSerialized = ''

  const tick = async () => {
    if (stopped) return
    const dir = await locateActiveFlowDir(
      options.payload.storeFlowDir,
      options.flowsRoot,
      options.payload.flowName,
      options.runStartedAtMs,
    )
    if (!dir) return
    const raw = await readFile(join(dir, 'FLOW.md'), 'utf8').catch(() => null)
    if (!raw) return
    const parsed = parseFrozenFlowInstance(raw)
    if (!parsed.steps.length) return
    const serialized = JSON.stringify(parsed.steps)
    if (serialized === lastSerialized) return
    lastSerialized = serialized
    await postStateCallback(options.payload.appUrl, options.payload.runId, {
      steps: parsed.steps.map((s) => ({
        ...s,
        harness: options.payload.harness,
      })),
    })
  }

  const timer = setInterval(() => {
    void tick()
  }, 600)

  return () => {
    stopped = true
    clearInterval(timer)
  }
}

async function locateActiveFlowDir(
  expectedDir: string,
  flowsRoot: string,
  flowName: string,
  runStartedAtMs: number,
): Promise<string | null> {
  if (existsSync(join(expectedDir, 'FLOW.md'))) {
    return expectedDir
  }
  const entries = await readdir(flowsRoot, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.includes(flowName)) continue
    const candidateFlowMd = join(flowsRoot, entry.name, 'FLOW.md')
    const stat = await lstat(candidateFlowMd).catch(() => null)
    if (stat && stat.mtimeMs >= runStartedAtMs - 1_000) {
      return join(flowsRoot, entry.name)
    }
  }
  return null
}

async function reconcileFlowArtifactsDir(
  payload: z.infer<typeof rigExecuteSchema>,
  flowsRoot: string,
  runStartedAtMs: number,
): Promise<string> {
  const located = await locateActiveFlowDir(
    payload.storeFlowDir,
    flowsRoot,
    payload.flowName,
    runStartedAtMs,
  )
  if (!located || located === payload.storeFlowDir) {
    return payload.storeFlowDir
  }
  await mkdir(payload.storeFlowDir, { recursive: true, mode: 0o700 })
  for (const filename of ['FLOW.md', 'logs.txt']) {
    const src = join(located, filename)
    const dst = join(payload.storeFlowDir, filename)
    if (existsSync(src) && !existsSync(dst)) {
      await copyFile(src, dst)
    }
  }
  return payload.storeFlowDir
}

function buildFlowGoPrompt(
  payload: z.infer<typeof rigExecuteSchema>,
  worktreePath: string,
  flowMdPath: string,
  logsPath: string,
): string {
  const inputEntries = Object.entries(payload.inputs)
  const inputsText = inputEntries.length
    ? inputEntries.map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`).join('\n')
    : '- (use flow defaults)'
  const flagsText = payload.flags.length ? payload.flags.join(' ') : '(none)'
  const hasMerge = payload.flags.includes('--merge')
  const hasLocal = payload.flags.includes('--local')

  return [
    `/difflab-flow go ${payload.flowName}`,
    '',
    'Execute this non-interactive orchestrated Difflab workflow run end to end using the `difflab-flow` skill (`references/workflows/go.md`), `difflab-plan`, `difflab-review`, and `pr` skills:',
    `- Repository checkout (already an isolated Git worktree — create or switch branches directly in place without creating another worktree): ${worktreePath}`,
    `- Flow definition file: ${payload.definitionPath}`,
    `- Exact Run ID: ${payload.runId}`,
    `- Scaffold frozen FLOW.md at relative path \`.difflab/flows/${payload.runId}\` with filename \`FLOW.md\` (physical path: ${flowMdPath})`,
    `- Append step start/completion logs via \`log_append\` to: ${logsPath}`,
    `- Use MCP server \`difflab-rig_difflab\` for \`project_context\`, \`template_list\`, \`scaffold\`, \`log_append\`, and \`flow_state_update\`.`,
    `- Bound inputs:\n${inputsText}`,
    `- Selected flags: ${flagsText}`,
    '- Explicit invocation permissions from the user:',
    hasLocal
      ? '  - Local-only run: file edits and local checks are authorized; do NOT commit, push, or access remote pull requests.'
      : '  - Authorized for all capabilities required by selected steps in the definition Contract (including branch creation in this worktree, scoped local commits, pushing to origin, creating/updating draft PRs, inline review findings/replies/thread resolution, verifying CI, and marking PR ready when gates pass). Do not pause for routine confirmation prompts.',
    hasMerge
      ? '  - `--merge` was explicitly selected: final gated merge is authorized once all checks and review gates pass.'
      : '  - `--merge` was NOT selected: stop before merge and leave any ready PR open.',
    '  - Never add AI attributions, model names, `Generated via` footers, or AI `Co-authored-by` trailers anywhere (including REVIEW.md, commits, PR descriptions, or comments).',
  ].join('\n')
}

async function writeHarnessSettings(
  payload: z.infer<typeof rigExecuteSchema>,
  worktreePath: string,
  trustedWorkspaces: string[],
  difflabHome: string,
): Promise<void> {
  const settingsPath = join(payload.storeFlowDir, 'harness-settings.json')
  await writeFile(
    settingsPath,
    JSON.stringify(
      {
        trustedWorkspaces,
        allowNonWorkspaceAccess: true,
        runId: payload.runId,
        flowName: payload.flowName,
        harness: payload.harness,
        worktreePath,
        appUrl: payload.appUrl,
        mcp: {
          difflab: {
            env: {
              DIFFLAB_HOME_ROOT: difflabHome,
              DIFFLAB_RUN_ID: payload.runId,
              DIFFLAB_APP_URL: payload.appUrl,
            },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  )
}

async function writeFallbackBlockerFlow(
  flowMdPath: string,
  payload: z.infer<typeof rigExecuteSchema>,
  reason: string,
): Promise<void> {
  const content = [
    `# Flow run: ${payload.flowName}`,
    '',
    '- **Status:** blocked',
    `- **Definition:** ${payload.definitionPath}`,
    `- **Repository:** ${payload.repoRoot}`,
    `- **Run ID:** ${payload.runId}`,
    '',
    '## Steps',
    '',
    '## Blocker',
    '',
    reason,
    '',
    '## Contract',
    '',
    `Blocked before execution for run ${payload.runId}.`,
    '',
  ].join('\n')
  await writeFile(flowMdPath, content, 'utf8')
}

async function recordOrWriteBlocker(
  flowMdPath: string,
  payload: z.infer<typeof rigExecuteSchema>,
  reason: string,
): Promise<void> {
  const existing = await readFile(flowMdPath, 'utf8').catch(() => null)
  if (!existing) {
    await writeFallbackBlockerFlow(flowMdPath, payload, reason)
    return
  }
  const updated = existing
    .replace('- **Status:** in progress', '- **Status:** blocked')
    .replace(/## Blocker\n\n[\s\S]*?(?=\n## Contract|$)/, `## Blocker\n\n${reason}\n`)
  await writeFile(flowMdPath, updated, 'utf8').catch(() => undefined)
}

async function readFlowResult(resultFile: string): Promise<FlowResultFile> {
  try {
    const raw = await readFile(resultFile, 'utf8')
    return JSON.parse(raw) as FlowResultFile
  } catch {
    return {}
  }
}

function resolveWorkspaceRoot(): string {
  if (process.env.DIFFLAB_WORKSPACE_ROOT) {
    return resolve(process.env.DIFFLAB_WORKSPACE_ROOT)
  }
  let dir = resolve(import.meta.dir)
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'skills/difflab-flow/SKILL.md'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('Could not locate Difflab workspace root containing skills/')
}

function resolveCliEntrypoint(workspaceRoot: string): string {
  const distEntry = join(workspaceRoot, 'apps/difflab-cli/dist/index.js')
  if (existsSync(distEntry)) return distEntry
  return join(workspaceRoot, 'apps/difflab-cli/src/index.ts')
}

function safeHeadSha(worktreePath: string): string | null {
  try {
    return gitHeadSha(worktreePath)
  } catch {
    return null
  }
}

function extractExitCode(snapshot: string, sentinelPrefix: string): number {
  const escaped = sentinelPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escaped}(-?\\d+)`)
  const match = regex.exec(snapshot)
  return match ? Number(match[1]) : 1
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function postStateCallback(
  appUrl: string,
  runId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await fetch(`${appUrl.replace(/\/$/, '')}/v1/runs/${encodeURIComponent(runId)}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined)
}
