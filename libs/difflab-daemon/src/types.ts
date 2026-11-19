// Types -----------------------------------------------------------------------
export type DaemonRecord = {
  pid: number
  server_url: string
  rpc_url: string
  started_at: string
}

export type DaemonStatus =
  { running: false } | { running: true; pid: number; server_url: string; rpc_url: string }

export type DaemonStartOptions = {
  stateDir: string
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  logPath?: string
  startupTimeoutMs?: number
}

export type DifflabDaemonOptions = {
  stateDir: string
  port?: number
  logPath?: string
  apiEntry?: string
}
