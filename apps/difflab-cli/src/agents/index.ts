import { join } from 'node:path'
import { setupHome, type AgentAdapter } from './adapter.js'
import { claudeCodeAdapter } from './claude-code.js'
import { codexAdapter } from './codex.js'
import { jsonAgentAdapter } from './json-config.js'

export const agentAdapters = {
  pi: jsonAgentAdapter('pi', (context) => join(setupHome(context), '.config', 'mcp', 'mcp.json')),
  cursor: jsonAgentAdapter('cursor', (context) => join(setupHome(context), '.cursor', 'mcp.json')),
  codex: codexAdapter,
  'claude-code': claudeCodeAdapter,
  'claude-desktop': jsonAgentAdapter('claude-desktop', (context) => {
    const home = setupHome(context)
    const platform = context.platform ?? process.platform
    if (platform === 'darwin') {
      return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    }
    if (platform === 'win32') {
      return join(
        process.env.APPDATA ?? join(home, 'AppData', 'Roaming'),
        'Claude',
        'claude_desktop_config.json',
      )
    }
    return join(home, '.config', 'Claude', 'claude_desktop_config.json')
  }),
} satisfies Record<string, AgentAdapter>

export const agentNames = Object.keys(agentAdapters)

export function agentAdapter(name: string): AgentAdapter | undefined {
  return Object.hasOwn(agentAdapters, name)
    ? agentAdapters[name as keyof typeof agentAdapters]
    : undefined
}
