import { createFileRoute } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/settings/$')({
  validateSearch: workspaceSearchSchema,
  head: () => ({
    meta: [{ title: 'Settings Not Found · xDrive' }],
  }),
  component: () => null,
})
