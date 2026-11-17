#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Types -----------------------------------------------------------------------
type ShimPullRequest = {
  number: number
  url: string
  title: string
  body: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  headRefName: string
  headRefOid: string
  baseRefName: string
  comments: { id: number; path?: string; line?: number; body: string }[]
}

type ShimState = {
  nextPrNumber: number
  pullRequests: ShimPullRequest[]
}

// API -------------------------------------------------------------------------
main(process.argv.slice(2))

// Helpers ---------------------------------------------------------------------
function main(args: string[]): void {
  const statePath = process.env.DIFFLAB_GH_STATE_FILE
  if (!statePath) {
    process.stderr.write('DIFFLAB_GH_STATE_FILE is required for gh-shim\n')
    process.exit(1)
  }

  const state = loadState(statePath)
  const [group, sub, ...rest] = args

  if (group === 'auth' && sub === 'status') {
    process.stdout.write('github.com\n  ✓ Logged in to github.com account difflab-e2e\n')
    return
  }

  if (group === 'repo' && sub === 'view') {
    const repoObj = {
      name: 'loops-demo',
      nameWithOwner: 'example/loops-demo',
      url: 'https://github.com/example/loops-demo',
      defaultBranchRef: { name: 'main' },
      mergeCommitAllowed: true,
      squashMergeAllowed: true,
      rebaseMergeAllowed: true,
      viewerPermission: 'WRITE',
    }
    outputJsonOrText(rest, repoObj, 'example/loops-demo\n')
    return
  }

  if (group === 'pr') {
    handlePrCommand(sub ?? '', rest, state, statePath)
    return
  }

  if (group === 'run') {
    handleRunCommand(sub ?? '', rest, state)
    return
  }

  if (group === 'api') {
    handleApiCommand([sub ?? '', ...rest].filter(Boolean), state, statePath)
    return
  }

  process.stdout.write('{}\n')
}

function handlePrCommand(sub: string, args: string[], state: ShimState, statePath: string): void {
  refreshHeadShas(state)

  if (sub === 'list') {
    const headFilter = readFlag(args, '--head')
    const items = state.pullRequests
      .filter((pr) => pr.state === 'OPEN')
      .filter((pr) => (!headFilter ? true : pr.headRefName === headFilter))
      .map(formatPrJson)
    if (args.includes('--json')) {
      process.stdout.write(`${JSON.stringify(items)}\n`)
      return
    }
    if (!items.length) {
      process.stdout.write('No pull requests match your search\n')
      return
    }
    for (const pr of items) {
      process.stdout.write(`#${pr.number}\t${pr.title}\t${pr.headRefName}\t${pr.state}\n`)
    }
    return
  }

  if (sub === 'create') {
    const isDraft = args.includes('--draft') || args.includes('-d')
    const title = readFlag(args, '--title') ?? readFlag(args, '-t') ?? 'Automated PR'
    const bodyFile = readFlag(args, '--body-file') ?? readFlag(args, '-F')
    const inlineBody = readFlag(args, '--body') ?? readFlag(args, '-b') ?? ''
    const body = bodyFile ? readFileSync(bodyFile, 'utf8') : inlineBody
    const baseRefName = readFlag(args, '--base') ?? readFlag(args, '-B') ?? 'main'
    const headRefName =
      readFlag(args, '--head') ?? readFlag(args, '-H') ?? gitCurrentBranch() ?? 'feature/change'
    const headRefOid = resolveBranchSha(headRefName)

    const number = state.nextPrNumber++
    const created: ShimPullRequest = {
      number,
      url: `https://github.com/example/loops-demo/pull/${number}`,
      title,
      body,
      state: 'OPEN',
      isDraft,
      headRefName,
      headRefOid,
      baseRefName,
      comments: [],
    }
    state.pullRequests.push(created)
    saveState(statePath, state)
    process.stdout.write(`${created.url}\n`)
    return
  }

  if (sub === 'view') {
    const target = findTargetPr(args, state)
    if (!target) {
      process.stderr.write('no pull requests found for current branch\n')
      process.exit(1)
    }
    saveState(statePath, state)
    const obj = formatPrJson(target)
    outputJsonOrText(
      args,
      obj,
      `title:\t${target.title}\nstate:\t${target.state}\ndraft:\t${target.isDraft}\nurl:\t${target.url}\n\n${target.body}\n`,
    )
    return
  }

  if (sub === 'edit') {
    const target = findTargetPr(args, state)
    if (!target) {
      process.stderr.write('no pull requests found\n')
      process.exit(1)
    }
    const title = readFlag(args, '--title') ?? readFlag(args, '-t')
    const bodyFile = readFlag(args, '--body-file') ?? readFlag(args, '-F')
    const inlineBody = readFlag(args, '--body') ?? readFlag(args, '-b')
    if (title) target.title = title
    if (bodyFile) target.body = readFileSync(bodyFile, 'utf8')
    else if (inlineBody !== undefined) target.body = inlineBody
    saveState(statePath, state)
    process.stdout.write(`${target.url}\n`)
    return
  }

  if (sub === 'ready') {
    const target = findTargetPr(args, state)
    if (!target) {
      process.stderr.write('no pull requests found\n')
      process.exit(1)
    }
    target.isDraft = false
    saveState(statePath, state)
    process.stdout.write(`✓ Pull request #${target.number} is marked as "ready for review"\n`)
    return
  }

  if (sub === 'checks') {
    const target = findTargetPr(args, state) ?? state.pullRequests.at(-1)
    const sha = target?.headRefOid ?? gitHeadShaFallback()
    const checks = [
      {
        name: 'On Commit',
        state: 'SUCCESS',
        bucket: 'pass',
        workflow: 'On Commit',
        link: `https://github.com/example/loops-demo/actions/runs/1001`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        headSha: sha,
      },
    ]
    if (args.includes('--json')) {
      process.stdout.write(`${JSON.stringify(checks)}\n`)
      return
    }
    process.stdout.write(
      `On Commit\tpass\t4s\thttps://github.com/example/loops-demo/actions/runs/1001\n`,
    )
    return
  }

  if (sub === 'merge') {
    const target = findTargetPr(args, state)
    if (!target) {
      process.stderr.write('no pull requests found\n')
      process.exit(1)
    }
    target.state = 'MERGED'
    target.isDraft = false
    saveState(statePath, state)
    process.stdout.write(`✓ Merged pull request #${target.number}\n`)
    return
  }
}

function handleRunCommand(sub: string, args: string[], state: ShimState): void {
  refreshHeadShas(state)
  const commitFlag =
    readFlag(args, '--commit') ?? state.pullRequests.at(-1)?.headRefOid ?? gitHeadShaFallback()
  const runObj = {
    databaseId: 1001,
    displayTitle: 'On Commit',
    name: 'On Commit',
    workflowName: 'On Commit',
    headSha: commitFlag,
    headBranch: state.pullRequests.at(-1)?.headRefName ?? gitCurrentBranch() ?? 'main',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    url: 'https://github.com/example/loops-demo/actions/runs/1001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  if (sub === 'list') {
    outputJsonOrText(args, [runObj], `completed\tsuccess\tOn Commit\t1001\n`)
    return
  }
  outputJsonOrText(args, runObj, `✓ On Commit · 1001 (head ${commitFlag})\n`)
}

function handleApiCommand(args: string[], state: ShimState, statePath: string): void {
  refreshHeadShas(state)
  const endpoint = args.find((a) => !a.startsWith('-')) ?? ''
  const method = (readFlag(args, '-X') ?? readFlag(args, '--method') ?? 'GET').toUpperCase()
  const latestPr = state.pullRequests.at(-1)
  const headSha = latestPr?.headRefOid ?? gitHeadShaFallback()

  if (endpoint === 'user') {
    process.stdout.write(`${JSON.stringify({ login: 'difflab-e2e', id: 1 })}\n`)
    return
  }

  if (endpoint === 'graphql') {
    const prNode = latestPr
      ? {
          id: `PR_${latestPr.number}`,
          number: latestPr.number,
          url: latestPr.url,
          title: latestPr.title,
          body: latestPr.body,
          state: latestPr.state,
          isDraft: latestPr.isDraft,
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'CLEAN',
          reviewDecision: null,
          headRefName: latestPr.headRefName,
          headRefOid: latestPr.headRefOid,
          baseRefName: latestPr.baseRefName,
          reviewThreads: { nodes: [] },
          reviews: { nodes: [] },
        }
      : null
    process.stdout.write(
      `${JSON.stringify({
        data: {
          viewer: { login: 'difflab-e2e' },
          repository: {
            defaultBranchRef: { name: 'main' },
            pullRequest: prNode,
          },
        },
      })}\n`,
    )
    return
  }

  if (endpoint.includes('/check-runs')) {
    process.stdout.write(
      `${JSON.stringify({
        total_count: 1,
        check_runs: [
          {
            id: 1001,
            name: 'On Commit',
            status: 'completed',
            conclusion: 'success',
            head_sha: headSha,
          },
        ],
      })}\n`,
    )
    return
  }

  if (endpoint.includes('/statuses') || endpoint.endsWith('/status')) {
    process.stdout.write(`${JSON.stringify({ state: 'success', sha: headSha, statuses: [] })}\n`)
    return
  }

  if (endpoint.includes('/pulls/') && endpoint.endsWith('/comments')) {
    if (method === 'POST' && latestPr) {
      const bodyVal = readFieldFlag(args, 'body') ?? 'Inline review comment'
      const comment = { id: latestPr.comments.length + 1, body: bodyVal }
      latestPr.comments.push(comment)
      saveState(statePath, state)
      process.stdout.write(`${JSON.stringify(comment)}\n`)
      return
    }
    process.stdout.write(`${JSON.stringify(latestPr?.comments ?? [])}\n`)
    return
  }

  if (endpoint.includes('/pulls/') && endpoint.endsWith('/reviews')) {
    process.stdout.write(`${JSON.stringify([])}\n`)
    return
  }

  if (/\/pulls\/\d+$/.test(endpoint) && latestPr) {
    process.stdout.write(
      `${JSON.stringify({
        number: latestPr.number,
        html_url: latestPr.url,
        title: latestPr.title,
        body: latestPr.body,
        state: latestPr.state.toLowerCase(),
        draft: latestPr.isDraft,
        mergeable: true,
        mergeable_state: 'clean',
        head: { sha: latestPr.headRefOid, ref: latestPr.headRefName },
        base: { ref: latestPr.baseRefName },
      })}\n`,
    )
    return
  }

  process.stdout.write(`${JSON.stringify({ ok: true })}\n`)
}

function formatPrJson(pr: ShimPullRequest) {
  return {
    number: pr.number,
    url: pr.url,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    isDraft: pr.isDraft,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    baseRefName: pr.baseRefName,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: '',
    reviews: [],
    comments: pr.comments,
    statusCheckRollup: [
      {
        __typename: 'CheckRun',
        name: 'On Commit',
        workflowName: 'On Commit',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        detailsUrl: 'https://github.com/example/loops-demo/actions/runs/1001',
      },
    ],
  }
}

function findTargetPr(args: string[], state: ShimState): ShimPullRequest | undefined {
  const positional = extractPositionalArg(args)
  if (positional) {
    const numMatch = /(?:\/pull\/|^#?)(\d+)$/.exec(positional)
    if (numMatch) {
      const n = Number(numMatch[1])
      return state.pullRequests.find((pr) => pr.number === n)
    }
    const byBranch = state.pullRequests.find((pr) => pr.headRefName === positional)
    if (byBranch) return byBranch
  }
  const branch = gitCurrentBranch()
  if (branch) {
    const byCurrent = state.pullRequests.find((pr) => pr.headRefName === branch)
    if (byCurrent) return byCurrent
  }
  return state.pullRequests.at(-1)
}

function extractPositionalArg(args: string[]): string | undefined {
  const flagsWithValues = new Set([
    '--json',
    '--jq',
    '--template',
    '-q',
    '-t',
    '--title',
    '-b',
    '--body',
    '-F',
    '--body-file',
    '-B',
    '--base',
    '-H',
    '--head',
    '-R',
    '--repo',
  ])
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (flagsWithValues.has(arg)) {
      i++
      continue
    }
    if (arg.startsWith('-')) continue
    return arg
  }
  return undefined
}

function outputJsonOrText(args: string[], data: unknown, fallbackText: string): void {
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(data)}\n`)
    return
  }
  process.stdout.write(fallbackText)
}

function readFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  const prefixed = args.find((a) => a.startsWith(`${flag}=`))
  return prefixed ? prefixed.slice(flag.length + 1) : undefined
}

function readFieldFlag(args: string[], fieldName: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-f' || args[i] === '-F' || args[i] === '--field') && args[i + 1]) {
      const pair = args[i + 1]!
      if (pair.startsWith(`${fieldName}=`)) {
        return pair.slice(fieldName.length + 1)
      }
    }
  }
  return undefined
}

function refreshHeadShas(state: ShimState): void {
  for (const pr of state.pullRequests) {
    const updated = resolveBranchSha(pr.headRefName)
    if (updated) pr.headRefOid = updated
  }
}

function resolveBranchSha(branch: string): string {
  const bareOrigin = process.env.DIFFLAB_ORIGIN_BARE_REPO
  if (bareOrigin && existsSync(bareOrigin)) {
    try {
      return execFileSync('/usr/bin/git', ['-C', bareOrigin, 'rev-parse', `refs/heads/${branch}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      // Fall back to current checkout HEAD below.
    }
  }
  return gitHeadShaFallback()
}

function gitCurrentBranch(): string | null {
  try {
    return (
      execFileSync('/usr/bin/git', ['branch', '--show-current'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || null
    )
  } catch {
    return null
  }
}

function gitHeadShaFallback(): string {
  try {
    return execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return '0000000000000000000000000000000000000000'
  }
}

function loadState(path: string): ShimState {
  if (!existsSync(path)) {
    return { nextPrNumber: 1, pullRequests: [] }
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ShimState
  } catch {
    return { nextPrNumber: 1, pullRequests: [] }
  }
}

function saveState(path: string, state: ShimState): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8')
}
