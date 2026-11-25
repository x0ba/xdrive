import { createFileRoute } from '@tanstack/react-router'
import { driveSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/starred')({
  validateSearch: driveSearchSchema,
  head: () => ({
    meta: [{ title: 'Starred · xDrive' }],
  }),
  component: () => null,
})
