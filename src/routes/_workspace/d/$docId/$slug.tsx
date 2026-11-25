import { createFileRoute, redirect } from '@tanstack/react-router'
import { PREDEFINED_MARBLE_TEMPLATES } from '#/lib/marble'
import { docCanonicalSlug, docSearchSchema } from '#/lib/routing'

export const Route = createFileRoute('/_workspace/d/$docId/$slug')({
  validateSearch: docSearchSchema,
  beforeLoad: ({ params, search }) => {
    const template = PREDEFINED_MARBLE_TEMPLATES.find(
      (item) => item.id === params.docId,
    )
    if (template) {
      const canonical = docCanonicalSlug(template)
      if (params.slug !== canonical) {
        throw redirect({
          to: '/d/$docId/$slug',
          params: {
            docId: template.id,
            slug: canonical,
          },
          search,
          replace: true,
        })
      }
    }
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} · xDrive` }],
  }),
  component: () => null,
})
