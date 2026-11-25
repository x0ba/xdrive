import { createFileRoute } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/settings/models/')({
  validateSearch: workspaceSearchSchema,
  head: () => ({
    meta: [{ title: 'Models & Providers · Settings · xDrive' }],
  }),
  component: () => null,
})
