import {
  mcpServer,
  type AgentAdapter,
  type McpConfigSetupResult,
  type SetupContext,
} from '../agents/adapter.js'
import { ConfigurationError } from '../errors.js'
import { isObject, patchJsonToFile, readJsonFile, type JsonObject } from 'utils/fsx'

// API -------------------------------------------------------------------------
export async function readJsonConfig(file: string): Promise<JsonObject> {
  try {
    return await readJsonFile(file)
  } catch (error) {
    throw new ConfigurationError(
      `Invalid MCP config at ${file}; not modified: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

export function serverStatus(
  config: JsonObject,
  file: string,
): 'missing' | 'matching' | 'conflicting' {
  if (config.mcpServers !== undefined && !isObject(config.mcpServers)) {
    throw new ConfigurationError(`Invalid MCP config at ${file}; mcpServers must be an object`)
  }
  if (!isObject(config.mcpServers) || !Object.hasOwn(config.mcpServers, 'difflab')) return 'missing'
  const entry = config.mcpServers.difflab
  return isObject(entry) &&
    entry.command === mcpServer.command &&
    Array.isArray(entry.args) &&
    entry.args.length === mcpServer.args.length &&
    entry.args.every((arg, index) => arg === mcpServer.args[index])
    ? 'matching'
    : 'conflicting'
}

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

// Helpers ---------------------------------------------------------------------
async function addJsonServer(file: string): Promise<McpConfigSetupResult> {
  const config = await readJsonConfig(file)
  const status = serverStatus(config, file)
  if (status === 'matching') return { file, status: 'existing' }
  if (status === 'conflicting')
    throw new ConfigurationError(
      `MCP server "difflab" already exists in ${file} with a different configuration; not modified`,
    )
  await patchJsonToFile(file, (current) => ({
    ...current,
    mcpServers: { ...(isObject(current.mcpServers) ? current.mcpServers : {}), difflab: mcpServer },
  }))
  return { file, status: 'added' }
}
