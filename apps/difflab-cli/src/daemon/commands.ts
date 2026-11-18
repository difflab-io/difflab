import type { Command } from 'commander'
import { DifflabError } from '../errors.js'
import { inspectDaemonStatus, startDaemon, stopDaemon } from './supervisor.js'

// API -------------------------------------------------------------------------
export function registerDaemonCommands(
  program: Command,
  write: (message: string) => void,
  options: { home?: string } = {},
): void {
  const daemon = program
    .command('daemon')
    .description('Manage local Difflab services and rig execution worker')

  daemon
    .command('up')
    .description('Start difflab-app, difflab-flow-engine, and the local rig worker')
    .option('--port <port>', 'Port for difflab-app (0 selects dynamic free ports)')
    .option('--foreground', 'Run supervisor in the foreground')
    .option('--json', 'Emit machine-readable JSON status')
    .action(async (flags: { port?: string; foreground?: boolean; json?: boolean }) => {
      const parsedPort = flags.port !== undefined ? Number(flags.port) : undefined
      if (parsedPort !== undefined && (!Number.isInteger(parsedPort) || parsedPort < 0)) {
        throw new DifflabError(`Invalid --port value: ${flags.port}`)
      }

      const report = await startDaemon({
        home: options.home,
        port: parsedPort,
        foreground: flags.foreground,
      })

      if (flags.json) {
        write(
          JSON.stringify({
            running: report.running,
            reused: report.reused ?? false,
            ...report.state,
          }),
        )
        return
      }

      const state = report.state!
      write(
        `${report.reused ? 'Reusing' : 'Started'} difflab daemon (pid ${state.pid}) — app ${state.appUrl}, engine ${state.engineUrl}, rig ${state.daemonRigUrl}`,
      )
    })

  daemon
    .command('status')
    .description('Inspect local Difflab daemon health, PIDs, and URLs')
    .option('--json', 'Emit machine-readable JSON status')
    .action(async (flags: { json?: boolean }) => {
      const report = await inspectDaemonStatus(options.home)
      if (flags.json) {
        write(
          JSON.stringify({
            running: report.running,
            ...(report.state ?? {}),
          }),
        )
        return
      }

      if (!report.running || !report.state) {
        write('difflab daemon is stopped.')
        return
      }

      write(
        `difflab daemon is running (pid ${report.state.pid})\n  app:    ${report.state.appUrl}\n  engine: ${report.state.engineUrl}\n  rig:    ${report.state.daemonRigUrl}${report.state.herdrSession ? `\n  herdr:  ${report.state.herdrSession}` : ''}`,
      )
    })

  daemon
    .command('down')
    .description('Stop the local Difflab daemon and supervised services')
    .option('--json', 'Emit machine-readable JSON output')
    .action(async (flags: { json?: boolean }) => {
      const outcome = await stopDaemon(options.home)
      if (flags.json) {
        write(JSON.stringify(outcome))
        return
      }
      write(
        outcome.stopped
          ? `Stopped difflab daemon (pid ${outcome.pid}).`
          : 'difflab daemon was already stopped.',
      )
    })
}
