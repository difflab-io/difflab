import { spawn } from 'node:child_process'
import { execCommand } from './processx.js'

// Types -----------------------------------------------------------------------
export type HerdrClientOptions = {
  bin?: string
  session?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export type HerdrCreatedTab = {
  tabId: string
  paneId: string
  workspaceId?: string
}

export type HerdrAgentInfo = {
  name: string
  paneId: string
  kind?: string
  state: string
}

export class HerdrError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'HerdrError'
  }
}

// API -------------------------------------------------------------------------
/** Creates a thin client over the local `herdr` CLI for non-focus tab and agent control. */
export function createHerdrClient(options: HerdrClientOptions = {}) {
  const bin = options.bin ?? process.env.DIFFLAB_HERDR_BIN ?? 'herdr'
  const session = options.session ?? process.env.DIFFLAB_HERDR_SESSION

  const baseEnv = options.env ?? process.env
  const invokeEnv: NodeJS.ProcessEnv = session
    ? {
        ...baseEnv,
        HERDR_SOCKET: undefined,
        HERDR_WORKSPACE_ID: undefined,
        HERDR_TAB_ID: undefined,
        HERDR_PANE_ID: undefined,
      }
    : baseEnv

  const invoke = async (args: string[], timeoutMs = 120_000): Promise<string> => {
    const fullArgs = session ? ['--session', session, ...args] : [...args]
    try {
      const { stdout } = await execCommand(bin, fullArgs, {
        cwd: options.cwd,
        env: invokeEnv,
        timeoutMs,
      })
      return stdout.trim()
    } catch (error) {
      throw new HerdrError(
        `Herdr command failed (${[bin, ...fullArgs].join(' ')}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  return {
    session: session ?? null,

    async ensureServer(timeoutMs = 8_000): Promise<void> {
      try {
        await invoke(['workspace', 'list'], 3_000)
        return
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!msg.includes('server_not_running') && !msg.includes('no herdr server')) {
          throw error
        }
      }

      const serverArgs = session ? ['--session', session, 'server'] : ['server']
      const child = spawn(bin, serverArgs, {
        cwd: options.cwd,
        env: invokeEnv,
        detached: true,
        stdio: 'ignore',
      })
      child.unref()

      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        try {
          await invoke(['workspace', 'list'], 2_000)
          return
        } catch {
          await new Promise((r) => setTimeout(r, 100))
        }
      }
      throw new HerdrError(
        `Timed out waiting for headless Herdr server (${session ?? 'default'}) to start`,
      )
    },

    async ensureWorkspace(cwd: string, label: string, envVars: Record<string, string> = {}) {
      const args = ['workspace', 'create', '--cwd', cwd, '--label', label, '--no-focus']
      for (const [key, value] of Object.entries(envVars)) {
        args.push('--env', `${key}=${value}`)
      }
      const raw = parseJsonRecord(await invoke(args))
      const result = asRecord(raw.result ?? raw)
      const workspace = asRecord(result.workspace)
      const tab = asRecord(result.tab)
      const pane = asRecord(result.root_pane)
      const workspaceId = String(workspace.workspace_id ?? workspace.id ?? '')
      const tabId = String(tab.tab_id ?? tab.id ?? '')
      const paneId = String(pane.pane_id ?? pane.id ?? '')
      if (!paneId) throw new HerdrError('Herdr workspace create returned no root_pane ID')
      return { workspaceId, tabId, paneId }
    },

    async createTab(
      cwd: string,
      label: string,
      options: { workspaceId?: string; env?: Record<string, string> } = {},
    ): Promise<HerdrCreatedTab> {
      const args = ['tab', 'create', '--cwd', cwd, '--label', label, '--no-focus']
      if (options.workspaceId) args.push('--workspace', options.workspaceId)
      for (const [key, value] of Object.entries(options.env ?? {})) {
        args.push('--env', `${key}=${value}`)
      }
      const raw = parseJsonRecord(await invoke(args))
      const result = asRecord(raw.result ?? raw)
      const tab = asRecord(result.tab)
      const pane = asRecord(result.root_pane)
      const tabId = String(tab.tab_id ?? tab.id ?? '')
      const paneId = String(pane.pane_id ?? pane.id ?? '')
      if (!paneId) throw new HerdrError('Herdr tab create returned no root_pane ID')
      return { tabId, paneId, workspaceId: options.workspaceId }
    },

    async reportPaneMetadata(
      paneId: string,
      metadata: {
        title?: string
        displayAgent?: string
        stateLabel?: string
        tokens?: Record<string, string>
      },
    ): Promise<void> {
      const args = ['pane', 'report-metadata', paneId, '--source', 'difflab']
      if (metadata.title) args.push('--title', metadata.title)
      if (metadata.displayAgent) args.push('--display-agent', metadata.displayAgent)
      if (metadata.stateLabel) {
        const formatted = metadata.stateLabel.includes('=')
          ? metadata.stateLabel
          : `${mapStatusKey(metadata.stateLabel)}=${metadata.stateLabel}`
        args.push('--state-label', formatted)
      }
      for (const [key, value] of Object.entries(metadata.tokens ?? {})) {
        args.push('--token', `${key}=${value}`)
      }
      await invoke(args)
    },

    async runInPane(paneId: string, commandLine: string): Promise<void> {
      await invoke(['pane', 'run', paneId, commandLine])
    },

    async waitPaneOutput(paneId: string, match: string, timeoutMs = 120_000): Promise<string> {
      return invoke(
        [
          'pane',
          'wait-output',
          paneId,
          '--match',
          match,
          '--source',
          'recent-unwrapped',
          '--timeout',
          String(timeoutMs),
        ],
        timeoutMs + 5_000,
      )
    },

    async readPane(paneId: string, lines = 120): Promise<string> {
      return invoke([
        'pane',
        'read',
        paneId,
        '--source',
        'recent-unwrapped',
        '--lines',
        String(lines),
      ])
    },

    async startAgent(
      agentName: string,
      kind: string,
      paneId: string,
      agentArgs: string[] = [],
      timeoutMs = 30_000,
    ): Promise<void> {
      const args = [
        'agent',
        'start',
        agentName,
        '--kind',
        kind,
        '--pane',
        paneId,
        '--timeout',
        String(timeoutMs),
      ]
      if (agentArgs.length > 0) args.push('--', ...agentArgs)
      await invoke(args, timeoutMs + 5_000)
    },

    async promptAgent(agentName: string, prompt: string, timeoutMs = 300_000): Promise<void> {
      await invoke(
        ['agent', 'prompt', agentName, prompt, '--wait', '--timeout', String(timeoutMs)],
        timeoutMs + 10_000,
      )
    },

    async listAgents(): Promise<HerdrAgentInfo[]> {
      const raw = parseJsonRecord(await invoke(['agent', 'list']))
      const result = asRecord(raw.result ?? raw)
      const items = Array.isArray(result.agents)
        ? result.agents
        : Array.isArray(raw.agents)
          ? raw.agents
          : []
      return items.map((entry) => {
        const record = asRecord(entry)
        return {
          name: String(record.name ?? record.agent ?? ''),
          paneId: String(record.pane_id ?? record.paneId ?? ''),
          kind: record.kind ? String(record.kind) : undefined,
          state: String(record.state ?? record.status ?? 'unknown'),
        }
      })
    },

    async listTabs(workspaceId?: string): Promise<Record<string, unknown>> {
      const args = ['tab', 'list']
      if (workspaceId) args.push('--workspace', workspaceId)
      return parseJsonRecord(await invoke(args))
    },

    async closeTab(tabId: string): Promise<void> {
      await invoke(['tab', 'close', tabId])
    },

    async deleteSession(targetSession = session): Promise<void> {
      if (!targetSession) return
      await execCommand(bin, ['session', 'stop', targetSession], {
        cwd: options.cwd,
        env: options.env,
        timeoutMs: 15_000,
      }).catch(() => undefined)
      await execCommand(bin, ['session', 'delete', targetSession], {
        cwd: options.cwd,
        env: options.env,
        timeoutMs: 15_000,
      }).catch(() => undefined)
    },
  }
}

// Helpers ---------------------------------------------------------------------
function mapStatusKey(label: string): string {
  const lower = label.toLowerCase()
  if (lower === 'done' || lower === 'completed') return 'done'
  if (lower === 'failed' || lower === 'blocked' || lower === 'error') return 'blocked'
  if (lower === 'idle') return 'idle'
  return 'working'
}
function parseJsonRecord(output: string): Record<string, unknown> {
  if (!output) return {}
  try {
    const parsed: unknown = JSON.parse(output)
    return asRecord(parsed)
  } catch {
    return { raw: output }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
