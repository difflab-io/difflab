import { join } from 'node:path'
import { DifflabConfig } from 'difflab-config'
import { lstatOrNull } from 'utils/fsx'
import { probeCommandVersion } from 'utils/processx'
import { TemplateService } from '../templates/service.js'

// Constants -------------------------------------------------------------------
const MIN_BUN_VERSION = [1, 4, 2] as const
const PREFERENCE_HOOKS = ['on-request-worktree', 'on-remote-delegation'] as const
const OPTIONAL_HOOKS = ['on-merge'] as const

// Types -----------------------------------------------------------------------
export type SetupReportOptions = {
  home?: string
  env?: NodeJS.ProcessEnv
  templateService?: TemplateService
}

// API -------------------------------------------------------------------------
/** Print a non-mutating machine readiness report for humans and coding agents. */
export async function runSetupReport(
  write: (message: string) => void,
  options: SetupReportOptions = {},
): Promise<void> {
  const env = options.env ?? process.env
  const root = DifflabConfig.resolvePaths(options.home, env).root
  let hasMissing = false

  write('Prerequisites:')
  if (probeCommandVersion('git', env)) {
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

  if (probeCommandVersion('npx', env)) {
    write('  [ok] npx')
  } else {
    hasMissing = true
    write('  [missing] npx (install Node.js with npx and add it to PATH)')
  }

  const forges = (['gh', 'glab'] as const).filter((tool) => Boolean(probeCommandVersion(tool, env)))
  if (forges.length > 0) {
    write(`  [ok] ${forges.join(', ')}`)
  } else {
    hasMissing = true
    write('  [missing] gh or glab (install gh or glab for remote PR and dispatch workflows)')
  }

  write('Templates:')
  const templateService = options.templateService ?? new TemplateService({ home: options.home })
  const templates = await templateService.inspectTemplates()
  if (templates.missing.length === 0 && templates.outdated.length === 0) {
    write(`  [ok] ${templates.directory} (${templates.total} up to date)`)
  } else {
    hasMissing = true
    if (templates.missing.length > 0) {
      write(
        `  [missing] ${templates.directory} (${templates.missing.length} missing; run \`difflab templates list\` to unpack templates)`,
      )
    }
    if (templates.outdated.length > 0) {
      write(
        `  [outdated] ${templates.directory} (${templates.outdated.length} differ from bundled templates: ${templates.outdated.join(', ')})`,
      )
    }
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
function checkBun(
  env: NodeJS.ProcessEnv,
): { ok: true; version: string } | { ok: false; detail: string } {
  const raw = probeCommandVersion('bun', env)
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
