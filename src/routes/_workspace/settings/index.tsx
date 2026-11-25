import { createFileRoute, redirect } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/settings/')({
  validateSearch: workspaceSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/settings/models',
      search,
      replace: true,
    })
  },
  component: () => null,
})
