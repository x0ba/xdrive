import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'

import { isClerkEnabled } from './integrations/clerk/config'

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

const backupSchedulerMiddleware = createMiddleware().server(
  async ({ next }) => {
    if (!process.env.VITEST) {
      const { ensureBackupSchedulerStarted } =
        await import('./lib/backup/scheduler.server')
      ensureBackupSchedulerStarted()
    }
    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: isClerkEnabled()
    ? [csrfMiddleware, backupSchedulerMiddleware, clerkMiddleware()]
    : [csrfMiddleware, backupSchedulerMiddleware],
}))
