import { createFileRoute } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/$')({
  validateSearch: workspaceSearchSchema,
  head: () => ({
    meta: [{ title: 'Not Found · xDrive' }],
  }),
  component: () => null,
})
