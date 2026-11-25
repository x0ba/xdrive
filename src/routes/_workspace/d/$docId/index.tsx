import { createFileRoute } from '@tanstack/react-router'
import { docSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/d/$docId/')({
  validateSearch: docSearchSchema,
  head: () => ({
    meta: [{ title: 'Document · xDrive' }],
  }),
  component: () => null,
})
