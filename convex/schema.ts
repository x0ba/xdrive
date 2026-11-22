import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const marbleCategory = v.union(
  v.literal('latex'),
  v.literal('notebook'),
  v.literal('document'),
  v.literal('slides'),
  v.literal('matrix'),
  v.literal('sandbox'),
  v.literal('custom'),
)

export const sharePermission = v.union(
  v.literal('view_only'),
  v.literal('comment_annotate'),
  v.literal('edit_no_ai'),
  v.literal('edit_with_ai_byok'),
  v.literal('edit_with_ai_shared'),
)

export const aiProviderId = v.union(
  v.literal('opencode-go'),
  v.literal('xai'),
  v.literal('claude'),
  v.literal('openai'),
)

export const intentStatus = v.union(
  v.literal('proposed'),
  v.literal('committed'),
  v.literal('discarded'),
  v.literal('thinking'),
  v.literal('failed'),
)

export default defineSchema({
  products: defineTable({
    title: v.string(),
    imageId: v.string(),
    price: v.number(),
  }),
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
  }),
  marbleDocuments: defineTable({
    slug: v.string(),
    fileName: v.string(),
    title: v.string(),
    description: v.string(),
    category: marbleCategory,
    isTemplate: v.boolean(),
    source: v.string(),
    nodeCount: v.number(),
    byteSize: v.number(),
    version: v.number(),
    starred: v.boolean(),
    pinned: v.boolean(),
    tags: v.array(v.string()),
    folder: v.string(),
    sharePermission,
    allowDuplication: v.boolean(),
    sharedAiDailyLimit: v.number(),
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_category', ['category']),
  marbleShares: defineTable({
    documentSlug: v.string(),
    email: v.string(),
    name: v.string(),
    permission: sharePermission,
    addedAt: v.number(),
  }).index('by_document', ['documentSlug']),
  marbleIntents: defineTable({
    documentSlug: v.string(),
    instruction: v.string(),
    note: v.string(),
    modelId: v.string(),
    providerId: aiProviderId,
    opsJson: v.string(),
    status: intentStatus,
    createdAt: v.number(),
  }).index('by_document', ['documentSlug']),
})
