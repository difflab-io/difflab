import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mcpServer, runCommand, setupHome, type AgentAdapter } from './adapter.js'
import { ConfigurationError } from '../errors.js'
import { hasErrorCode } from '../extensions/osx.js'

// API -------------------------------------------------------------------------
export const codexAdapter: AgentAdapter = {
  id: 'codex',
  async setupMcpConfig(context = {}) {
    const home = setupHome(context)
    const file = join(home, '.codex', 'config.toml')
    let content = ''
    try {
      content = await readFile(file, 'utf8')
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) throw error
    }
    const status = codexServerStatus(content)
    if (status === 'matching') return { file, status: 'existing' }
    if (status === 'conflicting') {
      throw new ConfigurationError(
        `Codex already has a different difflab entry in ${file}; not modified`,
      )
    }
    const run = context.run ?? runCommand
    run('codex', ['mcp', 'add', 'difflab', '--', mcpServer.command, ...mcpServer.args], home)
    return { file, status: 'added' }
  },
}

// Helpers ---------------------------------------------------------------------
function codexServerStatus(content: string): 'missing' | 'matching' | 'conflicting' {
  const lines = content.split(/\r?\n/)
  const start = lines.findIndex((line) =>
    /^\s*\[mcp_servers\.(?:difflab|"difflab"|'difflab')\]\s*(?:#.*)?$/.test(line),
  )
  if (start === -1) {
    return /^\s*\[mcp_servers\.(?:difflab|"difflab"|'difflab')\./m.test(content)
      ? 'conflicting'
      : 'missing'
  }
  const rest = lines.slice(start + 1)
  const next = rest.findIndex((line) => /^\s*\[/.test(line))
  const block = (next === -1 ? rest : rest.slice(0, next)).join('\n')
  const command = /^\s*command\s*=\s*["']npx["']\s*(?:#.*)?$/m.test(block)
  const args =
    /^\s*args\s*=\s*\[\s*["']-y["']\s*,\s*["']@difflab\/difflab-cli["']\s*,\s*["']mcp["']\s*,\s*["']serve["']\s*\]\s*(?:#.*)?$/m.test(
      block,
    )
  return command && args ? 'matching' : 'conflicting'
}
