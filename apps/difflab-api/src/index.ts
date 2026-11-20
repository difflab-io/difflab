import { configureAppLogger, createAppLogger, resolveLogLevel } from 'utils/logx'
import { startServer } from './server.js'

// API -------------------------------------------------------------------------
export { createApp, type AppDeps } from './app.js'
export { startServer } from './server.js'
export {
  createAuthService,
  type AuthService,
  type AuthServiceOptions,
} from './services/auth-service.js'
export { createProjectServiceImpl, type ProjectServiceDeps } from './services/project-service.js'

if (import.meta.main) {
  configureAppLogger({
    level: resolveLogLevel(process.env, 'info'),
    format: 'jsonl',
  })
  startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    createAppLogger('api')
      .withMetadata({
        pid: process.pid,
        message,
      })
      .error('difflab-api.startup-error')
    process.exit(1)
  })
}
