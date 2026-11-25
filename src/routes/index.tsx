import { createFileRoute, redirect } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/')({
  validateSearch: workspaceSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/drive',
      search,
      replace: true,
    })
  },
  component: () => null,
})
