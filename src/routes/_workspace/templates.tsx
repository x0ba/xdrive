import { createFileRoute } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/templates')({
  validateSearch: workspaceSearchSchema,
  head: () => ({
    meta: [{ title: 'Templates · xDrive' }],
  }),
  component: () => null,
})
