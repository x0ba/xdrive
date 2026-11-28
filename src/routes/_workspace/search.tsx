import { createFileRoute } from '@tanstack/react-router'
import { searchPageSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/search')({
  validateSearch: searchPageSchema,
  head: () => ({
    meta: [{ title: 'Search · xDrive' }],
  }),
  component: () => null,
})
