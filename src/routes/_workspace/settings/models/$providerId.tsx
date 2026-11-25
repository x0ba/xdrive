import { createFileRoute } from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/settings/models/$providerId')(
  {
    validateSearch: workspaceSearchSchema,
    head: ({ params }) => ({
      meta: [{ title: `${params.providerId} · Models & Providers · xDrive` }],
    }),
    component: () => null,
  },
)
