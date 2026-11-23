import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'

import { isClerkEnabled } from './integrations/clerk/config'

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: isClerkEnabled()
    ? [csrfMiddleware, clerkMiddleware()]
    : [csrfMiddleware],
}))
