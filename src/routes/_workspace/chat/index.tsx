import { createFileRoute } from '@tanstack/react-router'
import { chatSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/chat/')({
  validateSearch: chatSearchSchema,
  head: () => ({
    meta: [{ title: 'Drive Chat · xDrive' }],
  }),
  component: () => null,
})
