import { createFileRoute } from '@tanstack/react-router'
import { driveSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/f/$folderId/$slug')({
  validateSearch: driveSearchSchema,
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} · xDrive` }],
  }),
  component: () => null,
})
