import { createFileRoute, redirect } from '@tanstack/react-router'
import { PREDEFINED_MARBLE_TEMPLATES } from '#/lib/marble'
import { docCanonicalSlug, docSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/d/$docId/')({
  validateSearch: docSearchSchema,
  beforeLoad: ({ params, search }) => {
    const template = PREDEFINED_MARBLE_TEMPLATES.find(
      (item) => item.id === params.docId || item.slug === params.docId,
    )
    if (template) {
      throw redirect({
        to: '/d/$docId/$slug',
        params: {
          docId: template.id,
          slug: docCanonicalSlug(template),
        },
        search,
        replace: true,
      })
    }
  },
  head: () => ({
    meta: [{ title: 'Document · xDrive' }],
  }),
  component: () => null,
})
