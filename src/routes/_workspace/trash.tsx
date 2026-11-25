import { createFileRoute } from '@tanstack/react-router'
import { trashSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/trash')({
  validateSearch: trashSearchSchema,
  head: () => ({
    meta: [{ title: 'Trash · xDrive' }],
  }),
  component: () => null,
})
