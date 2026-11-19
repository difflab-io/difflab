import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { lstatOrNull } from 'utils/fsx'
import { userPaths } from '../store/user-store.js'

// Constants -------------------------------------------------------------------
const MIN_BUN_VERSION = [1, 4, 2] as const
const PREFERENCE_HOOKS = ['on-request-worktree', 'on-remote-delegation'] as const
const OPTIONAL_HOOKS = ['on-merge'] as const

// Types -----------------------------------------------------------------------
export type SetupReportOptions = {
  home?: string
  env?: NodeJS.ProcessEnv
}

// API -------------------------------------------------------------------------
/** Print a non-mutating machine readiness report for humans and coding agents. */
export async function runSetupReport(
  write: (message: string) => void,
  options: SetupReportOptions = {},
): Promise<void> {
  const env = options.env ?? process.env
  const root = userPaths(options.home).root
  let hasMissing = false

  write('Prerequisites:')
  const gitVersion = probeVersion('git', env)
  if (gitVersion) {
    write('  [ok] git')
  } else {
    hasMissing = true
    write('  [missing] git (install Git and add it to PATH)')
  }

  const bunStatus = checkBun(env)
  if (bunStatus.ok) {
    write(`  [ok] bun (${bunStatus.version})`)
  } else {
    hasMissing = true
    write(`  [missing] ${bunStatus.detail}`)
  }

  if (probeVersion('npx', env)) {
    write('  [ok] npx')
  } else {
    hasMissing = true
    write('  [missing] npx (install Node.js with npx and add it to PATH)')
  }

  const forges = (['gh', 'glab'] as const).filter((tool) => Boolean(probeVersion(tool, env)))
  if (forges.length > 0) {
    write(`  [ok] ${forges.join(', ')}`)
  } else {
    hasMissing = true
    write('  [missing] gh or glab (install gh or glab for remote PR and dispatch workflows)')
  }

  write('Difflab store:')
  const templatesPath = join(root, 'templates')
  const templatesEntry = await lstatOrNull(templatesPath)
  if (templatesEntry?.isDirectory()) {
    write(`  [ok] ${templatesPath}`)
  } else {
    hasMissing = true
    write(`  [missing] ${templatesPath} (run \`difflab templates list\` to unpack templates)`)
  }

  write('Hooks:')
  for (const name of PREFERENCE_HOOKS) {
    const hookFile = join(root, 'hooks', name, 'HOOK.md')
    const entry = await lstatOrNull(hookFile)
    if (entry?.isFile()) {
      write(`  [ok] ${name} (${hookFile})`)
    } else {
      hasMissing = true
      write(`  [missing] ${name} (${hookFile})`)
    }
  }
  for (const name of OPTIONAL_HOOKS) {
    const hookFile = join(root, 'hooks', name, 'HOOK.md')
    const entry = await lstatOrNull(hookFile)
    if (entry?.isFile()) {
      write(`  [ok] ${name} (${hookFile})`)
    } else {
      write(`  [optional] ${name} (${hookFile} not configured)`)
    }
  }

  write('')
  if (hasMissing) {
    write('Install missing dependencies above, or run this in a coding agent.')
    write(
      'Agent note: ask the user whether you must install or configure missing items for them before running changes.',
    )
  } else {
    write('Difflab machine setup is ready.')
  }
}

// Helpers ---------------------------------------------------------------------
function probeVersion(command: string, env: NodeJS.ProcessEnv): string | null {
  const result = spawnSync(command, ['--version'], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
  })
  if (result.error || result.status !== 0) return null
  const text = (result.stdout || result.stderr || '').trim()
  return text.split(/\r?\n/)[0] || command
}

function checkBun(
  env: NodeJS.ProcessEnv,
): { ok: true; version: string } | { ok: false; detail: string } {
  const raw = probeVersion('bun', env)
  if (!raw) {
    return { ok: false, detail: 'bun >= 1.4.2 (install Bun 1.4.2 or later and add it to PATH)' }
  }
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(raw)
  if (!match) {
    return { ok: false, detail: `bun >= 1.4.2 (unrecognized version output: ${raw})` }
  }
  const parsed = [Number(match[1]), Number(match[2]), Number(match[3])] as const
  if (!meetsMinVersion(parsed, MIN_BUN_VERSION)) {
    return {
      ok: false,
      detail: `bun >= 1.4.2 (found ${match[0]}; upgrade Bun to 1.4.2 or later)`,
    }
  }
  return { ok: true, version: match[0] }
}

function meetsMinVersion(
  actual: readonly [number, number, number],
  minimum: readonly [number, number, number],
): boolean {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true
    if (actual[index] < minimum[index]) return false
  }
  return true
}
