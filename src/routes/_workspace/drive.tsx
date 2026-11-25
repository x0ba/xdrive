import { createFileRoute } from '@tanstack/react-router'
import { driveSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/drive')({
  validateSearch: driveSearchSchema,
  head: () => ({
    meta: [{ title: 'My Drive · xDrive' }],
  }),
  component: () => null,
})
