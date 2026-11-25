import { createFileRoute } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/shared')({
  validateSearch: workspaceSearchSchema,
  head: () => ({
    meta: [{ title: 'Shared · xDrive' }],
  }),
  component: () => null,
})
