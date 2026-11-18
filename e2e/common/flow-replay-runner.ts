#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Constants -------------------------------------------------------------------
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolve(CURRENT_DIR, '../..')
const RECORDINGS_DIR = join(WORKSPACE_ROOT, 'e2e/recordings')
const CLI_ENTRY = join(WORKSPACE_ROOT, 'apps/difflab-cli/dist/index.js')

// Types -----------------------------------------------------------------------
type FlowRequest = {
  runId: string
  flowName: string
  definitionPath: string
  projectKey: string
  repoSlug: string
  repoRoot: string
  worktreePath: string
  storeFlowDir: string
  flowMdPath: string
  logsPath: string
  appUrl: string
  difflabHome: string
  inputs: Record<string, string>
  flags: string[]
  harness: string
}

type AutoreviewCassette = {
  version: number
  flowName: 'autoreview'
  definitionSha256: string
  reviewSlug: string
  flowInstanceInitial: string
  steps: {
    seq: number
    stepId: string
    handoff: string
    reviewMd?: string
    rubricYaml?: string
    worktreeEdits?: Record<string, string>
    reviewMdFinal?: string
  }[]
}

type AutospecCassette = {
  version: number
  flowName: 'autospec'
  definitionSha256: string
  branchName: string
  planSlug: string
  reviewSlug: string
  commitMessage: string
  prTitle: string
  prBody: string
  flowInstanceInitial: string
  flowInstanceCompleted: string
  planDraft: string
  planInProgress: string
  planCompleted: string
  reviewMd: string
  rubricYaml: string
  worktreeFiles: Record<string, string>
}

// API -------------------------------------------------------------------------
await replayRecordedFlow(process.argv[2], process.argv[3])

// Helpers ---------------------------------------------------------------------
async function replayRecordedFlow(requestPath?: string, resultPath?: string): Promise<void> {
  if (!requestPath || !resultPath) {
    throw new Error('Usage: flow-replay-runner.ts <flow-request.json> <flow-result.json>')
  }

  const req = JSON.parse(await readFile(requestPath, 'utf8')) as FlowRequest
  const defBytes = await readFile(req.definitionPath)
  const actualSha256 = createHash('sha256').update(defBytes).digest('hex')
  const projectStore = join(req.difflabHome, '.difflab/projects', req.projectKey, req.repoSlug)

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_ENTRY, 'mcp', 'serve'],
    stderr: 'pipe',
    env: {
      ...process.env,
      DIFFLAB_HOME_ROOT: req.difflabHome,
      DIFFLAB_RUN_ID: req.runId,
      DIFFLAB_APP_URL: req.appUrl,
    },
  })

  const mcp = new Client({ name: 'difflab-e2e-flow-replay', version: '0.1.0' })
  await mcp.connect(transport)

  try {
    await mcp.callTool({
      name: 'project_context',
      arguments: { cwd: req.worktreePath },
    })

    if (req.flowName === 'autoreview') {
      await replayAutoreview(mcp, req, projectStore, actualSha256, resultPath)
      return
    }

    if (req.flowName === 'autospec') {
      await replayAutospec(mcp, req, projectStore, actualSha256, resultPath)
      return
    }

    throw new Error(`No recorded workflow cassette found for flow '${req.flowName}'`)
  } finally {
    await mcp.close()
  }
}

async function replayAutoreview(
  mcp: Client,
  req: FlowRequest,
  projectStore: string,
  actualDefSha: string,
  resultPath: string,
): Promise<void> {
  const cassettePath = join(RECORDINGS_DIR, 'cli/autoreview-local.json')
  const cassette = JSON.parse(await readFile(cassettePath, 'utf8')) as AutoreviewCassette
  if (cassette.definitionSha256 !== actualDefSha) {
    throw new Error(
      `autoreview.md SHA-256 mismatch: cassette=${cassette.definitionSha256}, actual=${actualDefSha}`,
    )
  }

  const wt = req.worktreePath
  const baseSha = safeGit(wt, ['rev-parse', 'HEAD~1']) ?? safeGit(wt, ['rev-parse', 'HEAD'])!
  const headSha = safeGit(wt, ['rev-parse', 'HEAD'])!
  const bind = (text: string) =>
    bindTokens(text, {
      RUN_ID: req.runId,
      WORKTREE: wt,
      PROJECT_STORE: projectStore,
      DEFINITION_PATH: req.definitionPath,
      BASE_SHA: baseSha,
      HEAD_SHA: headSha,
      BASE_SHORT: baseSha.slice(0, 7),
      HEAD_SHORT: headSha.slice(0, 7),
    })

  const scaffoldFlow = await mcp.callTool({
    name: 'scaffold',
    arguments: {
      name: 'flow-instance',
      cwd: wt,
      path: `.difflab/flows/${req.runId}`,
      filename: 'FLOW.md',
    },
  })
  const flowMdPath = extractScaffoldPath(scaffoldFlow) ?? req.flowMdPath
  await writeFile(flowMdPath, bind(cassette.flowInstanceInitial), 'utf8')

  const reviewRelDir = `.difflab/reviews/${cassette.reviewSlug}`
  let reviewPath = join(projectStore, 'reviews', cassette.reviewSlug, 'REVIEW.md')
  const failStep = process.env.DIFFLAB_MOCK_FAIL_STEP?.trim()

  for (const step of cassette.steps) {
    await logAppend(mcp, req.logsPath, `Step ${step.seq} started: ${step.stepId}`)
    if (failStep && failStep === step.stepId) {
      await recordBlocker(flowMdPath, `Simulated failure during step ${step.stepId}`)
      await logAppend(mcp, req.logsPath, `Step ${step.seq} failed: ${step.stepId}`)
      process.exit(1)
    }

    if (step.stepId === 'local-review') {
      const revRes = await mcp.callTool({
        name: 'scaffold',
        arguments: { name: 'code-review', cwd: wt, path: reviewRelDir, filename: 'REVIEW.md' },
      })
      const rubRes = await mcp.callTool({
        name: 'scaffold',
        arguments: {
          name: 'code-review-rubric',
          cwd: wt,
          path: reviewRelDir,
          filename: 'rubric.yaml',
        },
      })
      reviewPath = extractScaffoldPath(revRes) ?? reviewPath
      const rubricPath = extractScaffoldPath(rubRes)!
      await writeFile(reviewPath, bind(step.reviewMd!), 'utf8')
      await writeFile(rubricPath, bind(step.rubricYaml!), 'utf8')
    } else if (step.stepId === 'address-local') {
      for (const [relFile, contents] of Object.entries(step.worktreeEdits ?? {})) {
        const absFile = join(wt, relFile)
        await mkdir(dirname(absFile), { recursive: true })
        await writeFile(absFile, contents, 'utf8')
      }
      execFileSync(process.execPath, ['test'], { cwd: wt, stdio: 'pipe' })
      await writeFile(reviewPath, bind(step.reviewMdFinal!), 'utf8')
    }

    const isFinal = step.seq === cassette.steps.length
    await checkOffStep(flowMdPath, step.seq, step.stepId, bind(step.handoff), isFinal)
    await logAppend(mcp, req.logsPath, `Step ${step.seq} complete: ${step.stepId}`)
  }

  await writeFile(
    resultPath,
    JSON.stringify({ status: 'done', summary: 'Replayed recorded agy autoreview run' }, null, 2),
    'utf8',
  )
}

async function replayAutospec(
  mcp: Client,
  req: FlowRequest,
  projectStore: string,
  actualDefSha: string,
  resultPath: string,
): Promise<void> {
  const cassettePath = join(RECORDINGS_DIR, 'app/autospec-linear-ready.json')
  const cassette = JSON.parse(await readFile(cassettePath, 'utf8')) as AutospecCassette
  if (cassette.definitionSha256 !== actualDefSha) {
    throw new Error(
      `autospec.md SHA-256 mismatch: cassette=${cassette.definitionSha256}, actual=${actualDefSha}`,
    )
  }

  const wt = req.worktreePath
  const baseSha = safeGit(wt, ['rev-parse', 'HEAD'])!
  let headSha = baseSha
  const objective = req.inputs.input ?? 'ENG-42: Add normalizeSlug helper'

  const bind = (text: string) =>
    bindTokens(text, {
      RUN_ID: req.runId,
      WORKTREE: wt,
      PROJECT_STORE: projectStore,
      DEFINITION_PATH: req.definitionPath,
      BASE_SHA: baseSha,
      HEAD_SHA: headSha,
      BASE_SHORT: baseSha.slice(0, 7),
      HEAD_SHORT: headSha.slice(0, 7),
    })

  const scaffoldFlow = await mcp.callTool({
    name: 'scaffold',
    arguments: {
      name: 'flow-instance',
      cwd: wt,
      path: `.difflab/flows/${req.runId}`,
      filename: 'FLOW.md',
    },
  })
  const flowMdPath = extractScaffoldPath(scaffoldFlow) ?? req.flowMdPath
  await writeFile(flowMdPath, bind(cassette.flowInstanceInitial), 'utf8')

  const orderedSteps = [
    'prepare-branch',
    'draft-plan',
    'implement',
    'remote-review',
    'address-remote',
    'publish-ready',
  ]
  const failStep = process.env.DIFFLAB_MOCK_FAIL_STEP?.trim()
  const planRelDir = `.difflab/plans/${cassette.planSlug}`
  const reviewRelDir = `.difflab/reviews/${cassette.reviewSlug}`
  let planPath = join(projectStore, 'plans', cassette.planSlug, 'PLAN.md')
  let reviewPath = join(projectStore, 'reviews', cassette.reviewSlug, 'REVIEW.md')
  let prUrl = 'https://github.com/example/loops-demo/pull/1'

  for (let idx = 0; idx < orderedSteps.length; idx++) {
    const seq = idx + 1
    const stepId = orderedSteps[idx]!
    await logAppend(mcp, req.logsPath, `Step ${seq} started: ${stepId}`)

    if (failStep && failStep === stepId) {
      await recordBlocker(flowMdPath, `Simulated failure during step ${stepId}`)
      await logAppend(mcp, req.logsPath, `Step ${seq} failed: ${stepId}`)
      process.exit(1)
    }

    let handoff = ''
    if (stepId === 'prepare-branch') {
      runGit(wt, ['fetch', 'origin'])
      runGit(wt, ['checkout', '-B', cassette.branchName])
      handoff = `\`checkout="${wt} (branch: ${cassette.branchName}, base: origin/main @ ${baseSha})"\``
    } else if (stepId === 'draft-plan') {
      const res = await mcp.callTool({
        name: 'scaffold',
        arguments: { name: 'spec-driven-plan', cwd: wt, path: planRelDir, filename: 'PLAN.md' },
      })
      planPath = extractScaffoldPath(res) ?? planPath
      const planDraftText = bind(cassette.planDraft).replace(
        '# Add normalizeSlug helper',
        `# ${objective.split('\n')[0]}`,
      )
      await writeFile(planPath, planDraftText, 'utf8')
      await logAppend(mcp, join(dirname(planPath), 'logs.txt'), 'Drafted implementation plan')
      handoff = `\`plan_path="${planPath}"\``
    } else if (stepId === 'implement') {
      for (const [relFile, contents] of Object.entries(cassette.worktreeFiles)) {
        const absFile = join(wt, relFile)
        await mkdir(dirname(absFile), { recursive: true })
        await writeFile(absFile, contents, 'utf8')
      }
      execFileSync(process.execPath, ['test'], { cwd: wt, stdio: 'pipe' })
      await writeFile(planPath, bind(cassette.planInProgress), 'utf8')
      await logAppend(
        mcp,
        join(dirname(planPath), 'logs.txt'),
        'Phase 1 complete: implemented src/slug.ts and src/slug.test.ts',
      )
      handoff = `\`diff_ref="${wt} (branch: ${cassette.branchName}, plan: ${planPath})"\``
    } else if (stepId === 'remote-review') {
      runGit(wt, ['add', ...Object.keys(cassette.worktreeFiles)])
      runGit(wt, ['commit', '-m', cassette.commitMessage])
      runGit(wt, ['push', '-u', 'origin', cassette.branchName])
      headSha = safeGit(wt, ['rev-parse', 'HEAD'])!

      const prBodyFile = join(req.storeFlowDir, 'pr-description.md')
      await writeFile(prBodyFile, cassette.prBody, 'utf8')
      prUrl = execFileSync(
        'gh',
        ['pr', 'create', '--draft', '--title', cassette.prTitle, '--body-file', prBodyFile],
        { cwd: wt, env: process.env, encoding: 'utf8' },
      ).trim()

      const revRes = await mcp.callTool({
        name: 'scaffold',
        arguments: { name: 'code-review', cwd: wt, path: reviewRelDir, filename: 'REVIEW.md' },
      })
      const rubRes = await mcp.callTool({
        name: 'scaffold',
        arguments: {
          name: 'code-review-rubric',
          cwd: wt,
          path: reviewRelDir,
          filename: 'rubric.yaml',
        },
      })
      reviewPath = extractScaffoldPath(revRes) ?? reviewPath
      const rubricPath = extractScaffoldPath(rubRes)!
      await writeFile(reviewPath, bind(cassette.reviewMd), 'utf8')
      await writeFile(rubricPath, bind(cassette.rubricYaml), 'utf8')
      handoff = `\`review_path="${reviewPath}"\`, \`pr_url="${prUrl}"\``
    } else if (stepId === 'address-remote') {
      execFileSync('gh', ['pr', 'view', '--json', 'url,headRefOid,isDraft'], {
        cwd: wt,
        env: process.env,
        stdio: 'pipe',
      })
      handoff = `\`result="pr_url=${prUrl}, head_sha=${headSha}, review_path=${reviewPath}, fixed=0, replied=0, deferred=0"\``
    } else if (stepId === 'publish-ready') {
      execFileSync('gh', ['pr', 'checks'], { cwd: wt, env: process.env, stdio: 'pipe' })
      execFileSync('gh', ['pr', 'ready'], { cwd: wt, env: process.env, stdio: 'pipe' })
      const finalPlan = bind(cassette.planCompleted).replace(
        '# Add normalizeSlug helper',
        `# ${objective.split('\n')[0]}`,
      )
      await writeFile(planPath, finalPlan, 'utf8')
      handoff = `\`pr_url="${prUrl}"\`, \`head_sha="${headSha}"\``
    }

    const isFinal = seq === orderedSteps.length
    await checkOffStep(flowMdPath, seq, stepId, handoff, isFinal)
    await logAppend(mcp, req.logsPath, `Step ${seq} complete: ${stepId}`)
  }

  await writeFile(
    resultPath,
    JSON.stringify(
      {
        status: 'done',
        commitSha: headSha,
        summary: 'Replayed recorded agy autospec run',
      },
      null,
      2,
    ),
    'utf8',
  )
}

function bindTokens(template: string, tokens: Record<string, string>): string {
  let out = template
  for (const [key, val] of Object.entries(tokens)) {
    out = out.replaceAll(`{{${key}}}`, val)
  }
  return out
}

async function checkOffStep(
  flowMdPath: string,
  seq: number,
  stepId: string,
  handoff: string,
  isFinal: boolean,
): Promise<void> {
  let content = await readFile(flowMdPath, 'utf8')
  const unchecked = `- [ ] ${seq}. ${stepId} —`
  const checked = `- [x] ${seq}. ${stepId} —`
  const idx = content.indexOf(unchecked)
  if (idx !== -1) {
    const before = content.slice(0, idx)
    const rest = content.slice(idx)
    const nextIdx = rest.slice(unchecked.length).search(/\n- \[[ x]\] \d+\. /)
    const end = nextIdx === -1 ? rest.length : unchecked.length + nextIdx
    const updatedBlock = rest
      .slice(0, end)
      .replace(unchecked, checked)
      .replace('  - Result/handoff: pending', `  - Result/handoff: ${handoff}`)
    content = before + updatedBlock + rest.slice(end)
  }
  if (isFinal) {
    content = content.replace('- **Status:** in progress', '- **Status:** completed')
  }
  await writeFile(flowMdPath, content, 'utf8')
}

async function recordBlocker(flowMdPath: string, reason: string): Promise<void> {
  const raw = await readFile(flowMdPath, 'utf8')
  await writeFile(
    flowMdPath,
    raw
      .replace('- **Status:** in progress', '- **Status:** blocked')
      .replace('## Blocker\n\nNone.', `## Blocker\n\n${reason}`),
    'utf8',
  )
}

async function logAppend(mcp: Client, path: string, message: string): Promise<void> {
  await mcp.callTool({ name: 'log_append', arguments: { path, message } })
}

function extractScaffoldPath(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null
  if ('isError' in response && (response as { isError?: boolean }).isError) {
    throw new Error(`MCP scaffold failed: ${JSON.stringify(response)}`)
  }
  const content = (response as { content?: { type?: string; text?: string }[] }).content
  const textItem = content?.find((item) => item.type === 'text' && typeof item.text === 'string')
  if (!textItem?.text) return null
  try {
    const parsed = JSON.parse(textItem.text) as { path?: string; result?: { path?: string } }
    return parsed.path ?? parsed.result?.path ?? null
  } catch {
    return textItem.text.trim() || null
  }
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function safeGit(cwd: string, args: string[]): string | null {
  try {
    return runGit(cwd, args)
  } catch {
    return null
  }
}
