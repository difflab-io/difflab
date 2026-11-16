import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { worktreeRetentionSchema } from 'difflab-db'
import { createGitWorktree, discoverGitRepository, gitHeadSha, removeGitWorktree } from 'utils/gitx'
import { createHerdrClient } from 'utils/herdrx'
import { assertMiseConfig } from 'utils/misex'
import { z } from 'zod'
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
  definitionSha256: z.string().min(1),
  resolvedInputs: z.record(z.string(), z.string()),
  enabledFlags: z.array(z.string()),
  disabledFlags: z.array(z.string()),
  omittedSteps: z.array(z.object({ stepId: z.string(), reason: z.string() })),
  allSelectedSteps: z.array(
    z.object({
      seq: z.number().int().positive(),
      stepId: z.string().min(1),
      handler: z.string(),
      requires: z.string(),
      receivesTemplate: z.string(),
      produces: z.string(),
      instructionsTemplate: z.string(),
      harness: z.string().optional(),
    }),
  ),
  step: z.object({
    stepId: z.string().min(1),
    seq: z.number().int().positive(),
    handler: z.string(),
    harness: z.string().min(1),
    receives: z.string(),
    produces: z.string(),
    instructions: z.string(),
  }),
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

type RunRigContext = {
  worktreePath: string
  paneId: string
  tabId: string
  workspaceId?: string
  agentName: string
  agentStarted: boolean
}

type StepResultFile = {
  handoff?: string
  summary?: string
  commitSha?: string
}

// API -------------------------------------------------------------------------
export function startRigServer(options: RigServerOptions = {}) {
  const herdrSession = options.herdrSession ?? process.env.DIFFLAB_HERDR_SESSION
  const herdrBin = options.herdrBin ?? process.env.DIFFLAB_HERDR_BIN
  const runContexts = new Map<string, RunRigContext>()
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
          executeRigStep(parsed.data, {
            home: options.home,
            herdrSession,
            herdrBin,
            runContexts,
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
        runContexts.delete(parsed.data.runId)
        runQueues.delete(parsed.data.runId)
        return Response.json({ removed })
      }

      return Response.json({ error: 'Not found' }, { status: 404 })
    },
  })

  return server
}

// Helpers ---------------------------------------------------------------------
async function executeRigStep(
  payload: z.infer<typeof rigExecuteSchema>,
  ctx: {
    home?: string
    herdrSession?: string
    herdrBin?: string
    runContexts: Map<string, RunRigContext>
  },
): Promise<void> {
  const paths = userPaths(ctx.home)
  const flowMdPath = join(payload.storeFlowDir, 'FLOW.md')
  const logsPath = join(payload.storeFlowDir, 'logs.txt')

  await mkdir(payload.storeFlowDir, { recursive: true, mode: 0o700 })
  await ensureInitialFlowSnapshot(flowMdPath, payload)

  try {
    await assertMiseConfig(payload.repoRoot)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await recordFlowBlocker(flowMdPath, reason)
    await appendProgressLog(logsPath, `Blocked before step ${payload.step.stepId}: ${reason}`)
    await postStateCallback(payload.appUrl, payload.runId, {
      status: 'failed',
      step: {
        stepId: payload.step.stepId,
        status: 'failed',
        summary: reason,
      },
      message: {
        stepId: payload.step.stepId,
        level: 'blocker',
        text: reason,
      },
    })
    return
  }

  let runCtx = ctx.runContexts.get(payload.runId)
  const herdr = createHerdrClient({
    bin: ctx.herdrBin,
    session: ctx.herdrSession,
  })

  try {
    if (!runCtx) {
      await mkdir(paths.worktrees, { recursive: true, mode: 0o700 })
      const worktreeCandidate = join(paths.worktrees, payload.runId)
      const exists = await lstat(worktreeCandidate).catch(() => null)
      const worktreePath = exists
        ? worktreeCandidate
        : createGitWorktree(payload.repoRoot, worktreeCandidate, `flow/${payload.runId}`, 'HEAD')

      const wtGit = discoverGitRepository(worktreePath)
      const repoStoreTarget = join(paths.projects, payload.projectKey, payload.repoSlug)
      await ensureRepoStore(worktreePath, repoStoreTarget, wtGit.excludePath)

      const envVars: Record<string, string> = {
        DIFFLAB_RUN_ID: payload.runId,
        DIFFLAB_APP_URL: payload.appUrl,
        DIFFLAB_WORKTREE_PATH: worktreePath,
        DIFFLAB_STORE_FLOW_DIR: payload.storeFlowDir,
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

      const safeSuffix = payload.runId
        .replace(/[^a-z0-9_-]/gi, '-')
        .toLowerCase()
        .slice(-24)
      runCtx = {
        worktreePath,
        paneId: createdTab.paneId,
        tabId: createdTab.tabId,
        workspaceId: createdTab.workspaceId,
        agentName: `dl-${safeSuffix}`.slice(0, 32),
        agentStarted: false,
      }
      ctx.runContexts.set(payload.runId, runCtx)
    }

    await writeHarnessSettings(payload, runCtx)
    await appendProgressLog(
      logsPath,
      `Step ${payload.step.seq} started: ${payload.step.stepId} (${payload.step.harness})`,
    )

    await herdr
      .reportPaneMetadata(runCtx.paneId, {
        title: `${payload.flowName}:${payload.step.stepId}`,
        displayAgent: payload.step.harness,
        stateLabel: 'running',
        tokens: {
          run: payload.runId,
          step: payload.step.stepId,
        },
      })
      .catch(() => undefined)

    await postStateCallback(payload.appUrl, payload.runId, {
      status: 'running',
      worktreePath: runCtx.worktreePath,
      herdrSession: herdr.session,
      herdrPaneId: runCtx.paneId,
      herdrAgentName: runCtx.agentName,
      step: {
        stepId: payload.step.stepId,
        status: 'running',
        harness: payload.step.harness,
      },
      message: {
        stepId: payload.step.stepId,
        level: 'info',
        text: `Running step ${payload.step.seq} (${payload.step.stepId}) in Herdr pane ${runCtx.paneId}`,
      },
    })

    const requestFile = join(
      payload.storeFlowDir,
      `step-${payload.step.seq}-${payload.step.stepId}.request.json`,
    )
    const resultFile = join(
      payload.storeFlowDir,
      `step-${payload.step.seq}-${payload.step.stepId}.result.json`,
    )
    await writeFile(
      requestFile,
      JSON.stringify(
        {
          runId: payload.runId,
          flowName: payload.flowName,
          projectKey: payload.projectKey,
          repoSlug: payload.repoSlug,
          worktreePath: runCtx.worktreePath,
          storeFlowDir: payload.storeFlowDir,
          flowMdPath,
          logsPath,
          appUrl: payload.appUrl,
          resolvedInputs: payload.resolvedInputs,
          enabledFlags: payload.enabledFlags,
          step: payload.step,
        },
        null,
        2,
      ),
      'utf8',
    )

    const customHarnessCmd = process.env.DIFFLAB_HARNESS_CMD?.trim()
    if (customHarnessCmd || payload.step.harness === 'mock') {
      if (!customHarnessCmd) {
        throw new Error('Harness kind `mock` requires DIFFLAB_HARNESS_CMD to be configured')
      }
      const tokenCore = `${payload.runId}_${payload.step.seq}_`
      const sentinelMatch = `__DIFFLAB_EXIT_${tokenCore}:`
      const envExports = [
        `DIFFLAB_RUN_ID=${shellQuote(payload.runId)}`,
        `DIFFLAB_STEP_ID=${shellQuote(payload.step.stepId)}`,
        `DIFFLAB_APP_URL=${shellQuote(payload.appUrl)}`,
        `DIFFLAB_WORKTREE_PATH=${shellQuote(runCtx.worktreePath)}`,
        `DIFFLAB_STORE_FLOW_DIR=${shellQuote(payload.storeFlowDir)}`,
        `MISE_TRUSTED_CONFIG_PATHS=${shellQuote(`${runCtx.worktreePath}:${payload.repoRoot}`)}`,
        ...(ctx.home ? [`HOME=${shellQuote(ctx.home)}`] : []),
      ].join(' ')

      // Write a short launcher script so Herdr PTY input stays well below macOS 1024-byte MAX_CANON.
      const stepScriptPath = join(paths.worktrees, `${payload.runId}-s${payload.step.seq}.sh`)
      await writeFile(
        stepScriptPath,
        [
          '#!/bin/sh',
          `cd ${shellQuote(runCtx.worktreePath)} || exit 1`,
          `export ${envExports}`,
          `mise exec -- ${customHarnessCmd} ${shellQuote(requestFile)} ${shellQuote(resultFile)}`,
          'rc=$?',
          `printf '\\n%s%s:%d\\n' '__DIFFLAB_EXIT_' ${shellQuote(tokenCore)} "$rc"`,
          '',
        ].join('\n'),
        { mode: 0o700 },
      )

      try {
        await herdr.runInPane(runCtx.paneId, `sh ${shellQuote(stepScriptPath)}`)
        const waitSnapshot = await herdr.waitPaneOutput(runCtx.paneId, sentinelMatch, 180_000)
        const paneSnapshot = waitSnapshot.includes(sentinelMatch)
          ? waitSnapshot
          : await herdr.readPane(runCtx.paneId, 200)
        const exitCode = extractExitCode(paneSnapshot, sentinelMatch)
        if (exitCode !== 0) {
          throw new Error(`Step ${payload.step.stepId} exited with status ${exitCode}`)
        }
      } finally {
        await rm(stepScriptPath, { force: true }).catch(() => undefined)
      }
    } else {
      if (!runCtx.agentStarted) {
        await herdr.startAgent(runCtx.agentName, payload.step.harness, runCtx.paneId)
        runCtx.agentStarted = true
      }
      const prompt = buildAgentStepPrompt(
        payload,
        runCtx.worktreePath,
        flowMdPath,
        logsPath,
        resultFile,
      )
      await herdr.promptAgent(runCtx.agentName, prompt, 600_000)
    }

    const stepResult = await readStepResult(resultFile)
    const headSha = safeHeadSha(runCtx.worktreePath)
    const handoff =
      stepResult.handoff ??
      `worktree=${runCtx.worktreePath}; step=${payload.step.stepId}${headSha ? `; commit=${headSha}` : ''}`
    const summary = stepResult.summary ?? `Completed ${payload.step.stepId}`
    const isFinalStep = payload.step.seq === payload.allSelectedSteps.length

    await markStepCompleteInFlowMd(
      flowMdPath,
      payload.step.seq,
      payload.step.stepId,
      payload.step.receives,
      handoff,
      isFinalStep,
    )
    await appendProgressLog(
      logsPath,
      `Step ${payload.step.seq} complete: ${payload.step.stepId} (${handoff})`,
    )

    await herdr
      .reportPaneMetadata(runCtx.paneId, {
        title: `${payload.flowName}:${payload.step.stepId}`,
        displayAgent: payload.step.harness,
        stateLabel: isFinalStep ? 'done' : 'idle',
        tokens: {
          run: payload.runId,
          step: payload.step.stepId,
        },
      })
      .catch(() => undefined)

    await postStateCallback(payload.appUrl, payload.runId, {
      ...(headSha ? { commitSha: stepResult.commitSha ?? headSha } : {}),
      step: {
        stepId: payload.step.stepId,
        status: 'done',
        harness: payload.step.harness,
        handoff,
        summary,
      },
      message: {
        stepId: payload.step.stepId,
        level: 'done',
        text: summary,
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await recordFlowBlocker(flowMdPath, reason)
    await appendProgressLog(
      logsPath,
      `Step ${payload.step.seq} failed (${payload.step.stepId}): ${reason}`,
    )
    if (runCtx) {
      await herdr
        .reportPaneMetadata(runCtx.paneId, {
          title: `${payload.flowName}:${payload.step.stepId}`,
          displayAgent: payload.step.harness,
          stateLabel: 'failed',
          tokens: { run: payload.runId, step: payload.step.stepId },
        })
        .catch(() => undefined)
    }
    await postStateCallback(payload.appUrl, payload.runId, {
      status: 'failed',
      step: {
        stepId: payload.step.stepId,
        status: 'failed',
        summary: reason,
      },
      message: {
        stepId: payload.step.stepId,
        level: 'error',
        text: reason,
      },
    })
  }
}

async function writeHarnessSettings(
  payload: z.infer<typeof rigExecuteSchema>,
  runCtx: RunRigContext,
): Promise<void> {
  const settingsPath = join(payload.storeFlowDir, 'harness-settings.json')
  await writeFile(
    settingsPath,
    JSON.stringify(
      {
        runId: payload.runId,
        flowName: payload.flowName,
        activeStep: payload.step.stepId,
        harness: payload.step.harness,
        handler: payload.step.handler,
        worktreePath: runCtx.worktreePath,
        herdrPaneId: runCtx.paneId,
        herdrAgentName: runCtx.agentName,
        appUrl: payload.appUrl,
        mcp: {
          difflab: {
            env: {
              DIFFLAB_RUN_ID: payload.runId,
              DIFFLAB_STEP_ID: payload.step.stepId,
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

async function ensureInitialFlowSnapshot(
  flowMdPath: string,
  payload: z.infer<typeof rigExecuteSchema>,
): Promise<void> {
  const existing = await lstat(flowMdPath).catch(() => null)
  if (existing) return

  const inputRows = Object.entries(payload.resolvedInputs)
    .map(([key, value]) => `| ${key} | ${value.replace(/\r?\n/g, ' ')} |`)
    .join('\n')

  const enabledText = payload.enabledFlags.length ? payload.enabledFlags.join(', ') : 'none'
  const disabledText = payload.disabledFlags.length ? payload.disabledFlags.join(', ') : 'none'
  const omittedText = payload.omittedSteps.length
    ? payload.omittedSteps.map((s) => `${s.stepId} (${s.reason})`).join('; ')
    : 'None omitted.'

  const stepsBlock = payload.allSelectedSteps
    .map(
      (s) => `- [ ] ${s.seq}. ${s.stepId} — \`${s.handler}\`
  - Requires: ${s.requires}
  - Instructions: ${s.instructionsTemplate.replace(/\s*\r?\n\s*/g, ' ')}
  - Receives: ${s.receivesTemplate.replace(/\s*\r?\n\s*/g, ' ')}
  - Expected output: ${s.produces}
  - Result/handoff: pending`,
    )
    .join('\n\n')

  const content = `# Flow run: ${payload.flowName}

- **Status:** in progress
- **Definition:** ${payload.definitionPath}
- **Definition SHA-256:** ${payload.definitionSha256}
- **Repository:** ${payload.repoRoot}
- **Run ID:** ${payload.runId}

## Resolved inputs

| Input | Value |
| --- | --- |
${inputRows || '| — | — |'}

## Selected flags and permissions

Enabled flags: ${enabledText}. Disabled flags: ${disabledText}.

## Selection provenance

${omittedText}

## Steps

${stepsBlock}

## Blocker

None.

## Contract

Frozen execution snapshot managed by difflab daemon for run ${payload.runId}.
`
  await writeFile(flowMdPath, content, 'utf8')
}

async function markStepCompleteInFlowMd(
  flowMdPath: string,
  seq: number,
  stepId: string,
  resolvedReceives: string,
  handoff: string,
  isFinalStep: boolean,
): Promise<void> {
  let content = await readFile(flowMdPath, 'utf8')
  const stepHeader = `- [ ] ${seq}. ${stepId} —`
  const checkedHeader = `- [x] ${seq}. ${stepId} —`
  if (content.includes(stepHeader)) {
    const idx = content.indexOf(stepHeader)
    const before = content.slice(0, idx)
    const rest = content.slice(idx)
    const nextStepIdx = rest.slice(stepHeader.length).search(/\n- \[[ x]\] \d+\. /)
    const blockEnd = nextStepIdx === -1 ? rest.length : stepHeader.length + nextStepIdx
    const updatedBlock = rest
      .slice(0, blockEnd)
      .replace(stepHeader, checkedHeader)
      .replace(/  - Receives: [^\n]+/, `  - Receives: ${resolvedReceives.replace(/\r?\n/g, ' ')}`)
      .replace('  - Result/handoff: pending', `  - Result/handoff: ${handoff}`)
    content = before + updatedBlock + rest.slice(blockEnd)
  }
  if (isFinalStep) {
    content = content.replace('- **Status:** in progress', '- **Status:** completed')
  }
  await writeFile(flowMdPath, content, 'utf8')
}

async function recordFlowBlocker(flowMdPath: string, reason: string): Promise<void> {
  try {
    let content = await readFile(flowMdPath, 'utf8')
    content = content
      .replace('- **Status:** in progress', '- **Status:** blocked')
      .replace(/## Blocker\n\n[\s\S]*?\n\n## Contract/, `## Blocker\n\n${reason}\n\n## Contract`)
    await writeFile(flowMdPath, content, 'utf8')
  } catch {
    // Ignore if FLOW.md could not be updated.
  }
}

async function readStepResult(resultFile: string): Promise<StepResultFile> {
  try {
    const raw = await readFile(resultFile, 'utf8')
    return JSON.parse(raw) as StepResultFile
  } catch {
    return {}
  }
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

function buildAgentStepPrompt(
  payload: z.infer<typeof rigExecuteSchema>,
  worktreePath: string,
  flowMdPath: string,
  logsPath: string,
  resultFile: string,
): string {
  return [
    `Execute Difflab flow '${payload.flowName}' step ${payload.step.seq} (${payload.step.stepId}) inside ${worktreePath}.`,
    `Handler: ${payload.step.handler}`,
    `Receives: ${payload.step.receives}`,
    `Expected output: ${payload.step.produces}`,
    `Instructions: ${payload.step.instructions}`,
    `Flow instance: ${flowMdPath}`,
    `Progress log: ${logsPath}`,
    `Write JSON {"handoff":"...","summary":"..."} to ${resultFile} when finished.`,
  ].join('\n')
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
