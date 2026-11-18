#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Types -----------------------------------------------------------------------
type ShimPane = {
  paneId: string
  tabId: string
  workspaceId: string
  cwd: string
  label: string
  env: Record<string, string>
  metadata: Record<string, unknown>
}

type ShimSessionState = {
  session: string
  nextNum: number
  workspaces: string[]
  panes: Record<string, ShimPane>
}

// API -------------------------------------------------------------------------
await main(process.argv.slice(2))

// Helpers ---------------------------------------------------------------------
async function main(rawArgs: string[]): Promise<void> {
  const args = [...rawArgs]
  let session = 'default'
  if (args[0] === '--session' && args[1]) {
    session = args[1]
    args.splice(0, 2)
  }

  const baseDir = process.env.DIFFLAB_HERDR_SHIM_DIR ?? join(tmpdir(), 'difflab-herdr-shim')
  await mkdir(baseDir, { recursive: true })
  const statePath = join(baseDir, `${sanitize(session)}.json`)

  const group = args[0] ?? ''
  const sub = args[1] ?? ''

  if (group === 'session' && (sub === 'stop' || sub === 'delete')) {
    const target = args[2] ?? session
    if (sub === 'delete') {
      await rm(join(baseDir, `${sanitize(target)}.json`), { force: true }).catch(() => undefined)
    }
    console.log(JSON.stringify({ ok: true, session: target }))
    return
  }

  const state = await loadState(statePath, session)

  if (group === 'workspace' && sub === 'list') {
    console.log(
      JSON.stringify({
        result: {
          workspaces: state.workspaces.map((id) => ({ workspace_id: id })),
        },
      }),
    )
    return
  }

  if (group === 'workspace' && sub === 'create') {
    const { cwd, label, env } = parseCreateFlags(args.slice(2))
    const num = state.nextNum++
    const workspaceId = `w${num}`
    const tabId = `${workspaceId}:t1`
    const paneId = `${workspaceId}:p1`
    state.workspaces.push(workspaceId)
    state.panes[paneId] = { paneId, tabId, workspaceId, cwd, label, env, metadata: {} }
    await saveState(statePath, state)
    console.log(
      JSON.stringify({
        result: {
          workspace: { workspace_id: workspaceId },
          tab: { tab_id: tabId },
          root_pane: { pane_id: paneId },
        },
      }),
    )
    return
  }

  if (group === 'tab' && sub === 'create') {
    const { cwd, label, env, workspace } = parseCreateFlags(args.slice(2))
    const workspaceId = workspace ?? state.workspaces[0] ?? 'w1'
    if (!state.workspaces.includes(workspaceId)) state.workspaces.push(workspaceId)
    const num = state.nextNum++
    const tabId = `${workspaceId}:t${num}`
    const paneId = `${workspaceId}:p${num}`
    state.panes[paneId] = { paneId, tabId, workspaceId, cwd, label, env, metadata: {} }
    await saveState(statePath, state)
    console.log(
      JSON.stringify({
        result: {
          tab: { tab_id: tabId, label },
          root_pane: { pane_id: paneId },
        },
      }),
    )
    return
  }

  if (group === 'tab' && sub === 'list') {
    const tabs = Object.values(state.panes).map((p) => ({
      tab_id: p.tabId,
      pane_id: p.paneId,
      workspace_id: p.workspaceId,
      cwd: p.cwd,
      label: p.label,
      metadata: p.metadata,
    }))
    console.log(JSON.stringify({ result: { tabs } }))
    return
  }

  if (group === 'tab' && sub === 'close') {
    const tabId = args[2] ?? ''
    for (const [paneId, pane] of Object.entries(state.panes)) {
      if (pane.tabId === tabId) delete state.panes[paneId]
    }
    await saveState(statePath, state)
    console.log(JSON.stringify({ ok: true }))
    return
  }

  if (group === 'pane' && sub === 'report-metadata') {
    const rest = args.slice(2)
    const paneId = findPositionalPaneId(rest)
    const pane = paneId ? state.panes[paneId] : undefined
    if (pane) {
      pane.metadata = parseMetadataFlags(rest)
      await saveState(statePath, state)
    }
    console.log(JSON.stringify({ ok: true }))
    return
  }

  if (group === 'pane' && sub === 'run') {
    const paneId = args[2] ?? ''
    const commandText = args.slice(3).join(' ')
    const pane = state.panes[paneId]
    if (!pane) {
      console.error(JSON.stringify({ error: `Unknown pane: ${paneId}` }))
      process.exit(1)
    }
    const logPath = paneLogPath(baseDir, session, paneId)
    const fd = openSync(logPath, 'a')
    const child = spawn('sh', ['-c', commandText], {
      cwd: pane.cwd,
      detached: true,
      stdio: ['ignore', fd, fd],
      env: { ...process.env, ...pane.env },
    })
    child.unref()
    closeSync(fd)
    console.log(JSON.stringify({ ok: true }))
    return
  }

  if (group === 'pane' && sub === 'wait-output') {
    const rest = args.slice(2)
    let matchText = ''
    let timeoutMs = 120_000
    let paneId = ''
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!
      if (arg === '--match' && rest[i + 1]) {
        matchText = rest[++i]!
      } else if (arg === '--timeout' && rest[i + 1]) {
        timeoutMs = Number(rest[++i]!)
      } else if (arg === '--source' || arg === '--lines' || arg === '--regex') {
        i++
      } else if (!arg.startsWith('--') && !paneId) {
        paneId = arg
      }
    }
    const logPath = paneLogPath(baseDir, session, paneId)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const content = await readFile(logPath, 'utf8').catch(() => '')
      if (matchText && content.includes(matchText)) {
        process.stdout.write(content)
        return
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    console.error(JSON.stringify({ error: `Timed out waiting for '${matchText}' in ${paneId}` }))
    process.exit(1)
  }

  if (group === 'pane' && sub === 'read') {
    const rest = args.slice(2)
    let lines = 120
    let paneId = ''
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i]!
      if (arg === '--lines' && rest[i + 1]) {
        lines = Number(rest[++i]!)
      } else if (arg === '--source' || arg === '--format') {
        i++
      } else if (!arg.startsWith('--') && !paneId) {
        paneId = arg
      }
    }
    const content = await readFile(paneLogPath(baseDir, session, paneId), 'utf8').catch(() => '')
    const tail = content.split(/\r?\n/).slice(-lines).join('\n')
    process.stdout.write(tail)
    return
  }

  if (group === 'agent' && sub === 'list') {
    const agents = Object.values(state.panes).map((p) => ({
      name: String(p.metadata.displayAgent ?? 'mock'),
      pane_id: p.paneId,
      kind: String(p.metadata.displayAgent ?? 'mock'),
      state: String(p.metadata.stateLabel ?? 'idle'),
    }))
    console.log(JSON.stringify({ result: { agents } }))
    return
  }

  console.log(JSON.stringify({ ok: true }))
}

function sanitize(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '_')
}

function paneLogPath(baseDir: string, session: string, paneId: string): string {
  return join(baseDir, `${sanitize(session)}-${sanitize(paneId)}.log`)
}

async function loadState(path: string, session: string): Promise<ShimSessionState> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ShimSessionState
  } catch {
    return { session, nextNum: 1, workspaces: [], panes: {} }
  }
}

async function saveState(path: string, state: ShimSessionState): Promise<void> {
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8')
}

function parseCreateFlags(args: string[]) {
  let cwd = process.cwd()
  let label = 'tab'
  let workspace: string | undefined
  const env: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--cwd' && args[i + 1]) cwd = args[++i]!
    else if (arg === '--label' && args[i + 1]) label = args[++i]!
    else if (arg === '--workspace' && args[i + 1]) workspace = args[++i]!
    else if (arg === '--env' && args[i + 1]) {
      const pair = args[++i]!
      const eq = pair.indexOf('=')
      if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
  }
  return { cwd, label, env, workspace }
}

function findPositionalPaneId(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (
      arg === '--source' ||
      arg === '--title' ||
      arg === '--display-agent' ||
      arg === '--agent' ||
      arg === '--state-label' ||
      arg === '--token'
    ) {
      i++
      continue
    }
    if (!arg.startsWith('--')) return arg
  }
  return undefined
}

function parseMetadataFlags(args: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const tokens: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--title' && args[i + 1]) out.title = args[++i]!
    else if (arg === '--display-agent' && args[i + 1]) out.displayAgent = args[++i]!
    else if (arg === '--state-label' && args[i + 1]) out.stateLabel = args[++i]!
    else if (arg === '--token' && args[i + 1]) {
      const pair = args[++i]!
      const eq = pair.indexOf('=')
      if (eq > 0) tokens[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
  }
  out.tokens = tokens
  return out
}
