import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  isFileError,
  mcpServer,
  type AgentAdapter,
  type SetupContext,
  type SetupResult,
} from './adapter.js'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function readJsonConfig(file: string): Promise<JsonObject> {
  try {
    if ((await lstat(file)).isSymbolicLink()) {
      throw new Error(`MCP config at ${file} is a symlink; refusing to replace it`)
    }
    const content = await readFile(file, 'utf8')
    try {
      const parsed: unknown = JSON.parse(content)
      if (!isObject(parsed)) throw new Error('root must be a JSON object')
      return parsed
    } catch (error) {
      throw new Error(
        `Invalid MCP config at ${file}; not modified: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  } catch (error) {
    if (isFileError(error, 'ENOENT')) return {}
    throw error
  }
}

export function serverStatus(
  config: JsonObject,
  file: string,
): 'missing' | 'matching' | 'conflicting' {
  if (config.mcpServers !== undefined && !isObject(config.mcpServers)) {
    throw new Error(`Invalid MCP config at ${file}; mcpServers must be an object`)
  }
  if (!isObject(config.mcpServers) || !Object.hasOwn(config.mcpServers, 'difflab')) {
    return 'missing'
  }
  const entry = config.mcpServers.difflab
  return isObject(entry) &&
    entry.command === mcpServer.command &&
    Array.isArray(entry.args) &&
    entry.args.length === mcpServer.args.length &&
    entry.args.every((arg, index) => arg === mcpServer.args[index])
    ? 'matching'
    : 'conflicting'
}

async function addJsonServer(file: string): Promise<SetupResult> {
  const config = await readJsonConfig(file)
  const status = serverStatus(config, file)
  if (status === 'matching') return { file, status: 'existing' }
  if (status === 'conflicting') {
    throw new Error(
      `MCP server "difflab" already exists in ${file} with a different configuration; not modified`,
    )
  }
  const updated = {
    ...config,
    mcpServers: { ...(isObject(config.mcpServers) ? config.mcpServers : {}), difflab: mcpServer },
  }
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(updated, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temp, file)
  } finally {
    await rm(temp, { force: true })
  }
  return { file, status: 'added' }
}

/** Register a new JSON-based agent by supplying its user-level config path. */
export function jsonAgentAdapter(
  id: string,
  configPath: (context: SetupContext) => string,
): AgentAdapter {
  return {
    id,
    setupMcpConfig(context = {}) {
      return addJsonServer(configPath(context))
    },
  }
}
