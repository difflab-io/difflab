#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Types -----------------------------------------------------------------------
type StepRequest = {
  runId: string
  flowName: string
  projectKey: string
  repoSlug: string
  worktreePath: string
  storeFlowDir: string
  flowMdPath: string
  logsPath: string
  appUrl: string
  resolvedInputs: Record<string, string>
  enabledFlags: string[]
  step: {
    stepId: string
    seq: number
    handler: string
    harness: string
    receives: string
    produces: string
    instructions: string
  }
}

// API -------------------------------------------------------------------------
await runMockStep(process.argv[2], process.argv[3])

// Helpers ---------------------------------------------------------------------
async function runMockStep(requestPath?: string, resultPath?: string): Promise<void> {
  if (!requestPath || !resultPath) {
    throw new Error('Usage: mock-agent.ts <request.json> <result.json>')
  }

  const req = JSON.parse(await readFile(requestPath, 'utf8')) as StepRequest
  const failStep = process.env.DIFFLAB_MOCK_FAIL_STEP?.trim()
  if (failStep && failStep === req.step.stepId) {
    console.error(`Simulated crash on step ${req.step.stepId}`)
    process.exit(1)
  }

  const currentDir = dirname(fileURLToPath(import.meta.url))
  const cliEntry = resolve(currentDir, '../../apps/difflab-cli/dist/index.js')
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliEntry, 'mcp', 'serve'],
    stderr: 'pipe',
    env: {
      ...process.env,
      DIFFLAB_RUN_ID: req.runId,
      DIFFLAB_STEP_ID: req.step.stepId,
      DIFFLAB_APP_URL: req.appUrl,
    },
  })

  const mcp = new Client({ name: 'difflab-e2e-mock-agent', version: '0.1.0' })
  await mcp.connect(transport)

  try {
    const outcome = await executeStepLogic(mcp, req)
    await mcp.callTool({
      name: 'flow_state_update',
      arguments: {
        runId: req.runId,
        stepId: req.step.stepId,
        message: outcome.summary,
        level: 'info',
        ...(outcome.commitSha ? { commitSha: outcome.commitSha } : {}),
      },
    })
    await writeFile(resultPath, JSON.stringify(outcome, null, 2), 'utf8')
    console.log(`[mock-agent] completed ${req.flowName}:${req.step.stepId} -> ${outcome.handoff}`)
  } finally {
    await mcp.close()
  }
}

async function executeStepLogic(
  mcp: Client,
  req: StepRequest,
): Promise<{ handoff: string; summary: string; commitSha?: string }> {
  const { stepId } = req.step
  const wt = req.worktreePath

  if (stepId === 'prepare-branch') {
    await logMcp(mcp, req.logsPath, `Verified isolated worktree checkout at ${wt}`)
    return {
      handoff: `checkout=${wt}; branch=flow/${req.runId}`,
      summary: `Prepared isolated worktree flow/${req.runId}`,
    }
  }

  if (stepId === 'draft-plan') {
    const planRelDir = `.difflab/plans/${req.runId}`
    const scaffoldRes = await mcp.callTool({
      name: 'scaffold',
      arguments: {
        name: 'spec-driven-plan',
        cwd: wt,
        path: planRelDir,
        filename: 'PLAN.md',
      },
    })
    const planPath = extractScaffoldPath(scaffoldRes) ?? join(wt, planRelDir, 'PLAN.md')
    const objective = req.resolvedInputs.input ?? 'Implement workflow task'
    await writeFile(
      planPath,
      [
        `# Implementation plan for ${req.runId}`,
        '',
        '- **Status:** in progress',
        `- **Branch:** flow/${req.runId}`,
        '',
        '## Intent',
        '',
        objective,
        '',
        '## Phases',
        '',
        '- [x] Phase 1: Scaffolded and validated inside isolated worktree.',
        '- [ ] Phase 2: Implement scoped module and commit inside worktree.',
        '',
      ].join('\n'),
      'utf8',
    )
    await logMcp(mcp, req.logsPath, `Created implementation plan at ${planPath}`)
    return {
      handoff: `plan_path=${planPath}`,
      summary: `Drafted PLAN.md for ${req.runId}`,
    }
  }

  if (stepId === 'implement') {
    const featureFile = join(wt, 'src/autospec-feature.ts')
    await mkdir(dirname(featureFile), { recursive: true })
    await writeFile(
      featureFile,
      [
        '// Constants -------------------------------------------------------------------',
        `export const AUTOSPEC_RUN_ID = '${req.runId}'`,
        '',
        '// API -------------------------------------------------------------------------',
        'export function describeAutospecFeature(): string {',
        `  return \`Implemented by orchestrated flow \${AUTOSPEC_RUN_ID}\``,
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    await logMcp(mcp, req.logsPath, 'Wrote src/autospec-feature.ts inside isolated worktree')
    return {
      handoff: `diff_ref=${wt}@worktree`,
      summary: 'Implemented src/autospec-feature.ts in worktree',
    }
  }

  if (stepId === 'remote-review') {
    runGit(wt, ['add', 'src/autospec-feature.ts'])
    runGit(wt, ['commit', '-m', `feat: implement orchestrated workflow changes (${req.runId})`])
    const headSha = runGit(wt, ['rev-parse', 'HEAD'])

    const reviewRelDir = `.difflab/reviews/${req.runId}`
    const scaffoldRes = await mcp.callTool({
      name: 'scaffold',
      arguments: {
        name: 'code-review',
        cwd: wt,
        path: reviewRelDir,
        filename: 'REVIEW.md',
      },
    })
    const reviewPath = extractScaffoldPath(scaffoldRes) ?? join(wt, reviewRelDir, 'REVIEW.md')
    await writeFile(
      reviewPath,
      [
        `# Code review for ${req.runId}`,
        '',
        `- **Head SHA:** ${headSha}`,
        '- **Findings:** 0 blocking issues',
        '',
        '## Summary',
        '',
        `Verified scoped commit ${headSha} in isolated worktree ${wt}.`,
        '',
      ].join('\n'),
      'utf8',
    )
    await logMcp(mcp, req.logsPath, `Committed ${headSha.slice(0, 8)} and recorded REVIEW.md`)
    return {
      handoff: `review_path=${reviewPath}; pr_url=https://github.com/example/repo/pull/42`,
      summary: `Committed ${headSha.slice(0, 8)} in worktree and completed review`,
      commitSha: headSha,
    }
  }

  if (stepId === 'address-remote') {
    const headSha = runGit(wt, ['rev-parse', 'HEAD'])
    await logMcp(mcp, req.logsPath, 'Verified 0 unresolved remote review requests')
    return {
      handoff: `result=fixed=0,replied=0,deferred=0,sha=${headSha}`,
      summary: 'Verified remote review threads (no-op)',
      commitSha: headSha,
    }
  }

  if (stepId === 'publish-ready') {
    const headSha = runGit(wt, ['rev-parse', 'HEAD'])
    const planPath = join(wt, `.difflab/plans/${req.runId}/PLAN.md`)
    const existingPlan = await readFile(planPath, 'utf8').catch(() => '')
    if (existingPlan) {
      await writeFile(
        planPath,
        existingPlan
          .replace('- **Status:** in progress', '- **Status:** completed')
          .replace('- [ ] Phase 2:', '- [x] Phase 2:'),
        'utf8',
      )
    }
    await logMcp(
      mcp,
      req.logsPath,
      `Reconciled PLAN.md and verified ready head ${headSha.slice(0, 8)}`,
    )
    return {
      handoff: `pr_url=https://github.com/example/repo/pull/42; head_sha=${headSha}`,
      summary: `Published ready PR at ${headSha.slice(0, 8)}`,
      commitSha: headSha,
    }
  }

  if (stepId === 'local-review') {
    const reviewRelDir = `.difflab/reviews/${req.runId}`
    const scaffoldRes = await mcp.callTool({
      name: 'scaffold',
      arguments: {
        name: 'code-review',
        cwd: wt,
        path: reviewRelDir,
        filename: 'REVIEW.md',
      },
    })
    const reviewPath = extractScaffoldPath(scaffoldRes) ?? join(wt, reviewRelDir, 'REVIEW.md')
    await writeFile(
      reviewPath,
      [
        `# Local code review (${req.runId})`,
        '',
        '- **Status:** findings recorded',
        '',
        '## Findings',
        '',
        '1. `src/reviewed-module.ts`: normalize greeting whitespace before returning.',
        '',
      ].join('\n'),
      'utf8',
    )
    await logMcp(mcp, req.logsPath, `Recorded 1 local finding in ${reviewPath}`)
    return {
      handoff: `review_path=${reviewPath}`,
      summary: 'Recorded 1 local finding in REVIEW.md',
    }
  }

  if (stepId === 'address-local') {
    const targetModule = join(wt, 'src/reviewed-module.ts')
    await mkdir(dirname(targetModule), { recursive: true })
    await writeFile(
      targetModule,
      [
        '// API -------------------------------------------------------------------------',
        'export function formatTopic(topic: string): string {',
        '  return topic.trim()',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    const reviewPath = join(wt, `.difflab/reviews/${req.runId}/REVIEW.md`)
    const prev = await readFile(reviewPath, 'utf8').catch(() => '')
    await writeFile(
      reviewPath,
      `${prev}\n## Addressed\n\n- Fixed whitespace normalization in \`src/reviewed-module.ts\` (fixed=1, replied=0, deferred=0).\n`,
      'utf8',
    )
    await logMcp(
      mcp,
      req.logsPath,
      'Applied local review fix in worktree without mutating Git history',
    )
    return {
      handoff: `result=review_path=${reviewPath},fixed=1,replied=0,deferred=0`,
      summary: 'Addressed 1 local review finding',
    }
  }

  await logMcp(mcp, req.logsPath, `Executed generic step ${stepId}`)
  return {
    handoff: `step=${stepId}; worktree=${wt}`,
    summary: `Completed ${stepId}`,
  }
}

async function logMcp(mcp: Client, logsPath: string, message: string): Promise<void> {
  await mcp.callTool({
    name: 'log_append',
    arguments: { path: logsPath, message },
  })
}

function extractScaffoldPath(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null
  if ('isError' in response && (response as { isError?: boolean }).isError) {
    throw new Error(`MCP scaffold failed: ${JSON.stringify(response)}`)
  }
  if (!('content' in response)) return null
  const content = (response as { content?: { type?: string; text?: string }[] }).content
  const textItem = content?.find((item) => item.type === 'text' && typeof item.text === 'string')
  if (!textItem?.text) return null
  try {
    const parsed = JSON.parse(textItem.text) as unknown
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed === 'object' && 'path' in parsed) {
      return String((parsed as { path: unknown }).path)
    }
    return null
  } catch {
    return textItem.text.trim() || null
  }
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}
