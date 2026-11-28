import { createFileRoute } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/settings/backup')({
  validateSearch: workspaceSearchSchema,
  head: () => ({
    meta: [{ title: 'Backup · Settings · xDrive' }],
  }),
  component: () => null,
})
