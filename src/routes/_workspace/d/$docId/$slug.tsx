import { createFileRoute } from '@tanstack/react-router'
import { docSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/d/$docId/$slug')({
  validateSearch: docSearchSchema,
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} · xDrive` }],
  }),
  component: () => null,
})
