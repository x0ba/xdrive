import { createFileRoute } from '@tanstack/react-router'
import { driveSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/f/$folderId/')({
  validateSearch: driveSearchSchema,
  head: () => ({
    meta: [{ title: 'Folder · xDrive' }],
  }),
  component: () => null,
})
