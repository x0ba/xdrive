import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { v } from 'convex/values'

import {
  aiProviderId,
  intentStatus,
  marbleCategory,
  sharePermission,
} from './schema'

const slugPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function assertSlug(slug: string) {
  if (!slugPattern.test(slug) || slug.includes('..')) {
    throw new Error('Invalid slug')
  }
}

function assertFileName(fileName: string) {
  if (
    fileName.includes('/') ||
    fileName.includes('\\') ||
    !fileName.endsWith('.mrbl')
  ) {
    throw new Error('fileName must be a single .mrbl file name')
  }
}

function countNodes(source: string) {
  return source.match(/data-marble-id\s*=\s*["'][^"']*["']/g)?.length ?? 0
}

function byteSizeOf(source: string) {
  return new TextEncoder().encode(source).byteLength
}

async function documentBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  return await ctx.db
    .query('marbleDocuments')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique()
}

async function sharesFor(ctx: QueryCtx | MutationCtx, documentSlug: string) {
  const shares = await ctx.db
    .query('marbleShares')
    .withIndex('by_document', (q) => q.eq('documentSlug', documentSlug))
    .collect()
  return shares.sort((a, b) => a.addedAt - b.addedAt)
}

async function intentsFor(ctx: QueryCtx | MutationCtx, documentSlug: string) {
  const intents = await ctx.db
    .query('marbleIntents')
    .withIndex('by_document', (q) => q.eq('documentSlug', documentSlug))
    .collect()
  return intents.sort((a, b) => b.createdAt - a.createdAt)
}

export const listDocuments = query({
  args: {
    category: v.optional(marbleCategory),
    folder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const category = args.category
    const documents = category
      ? await ctx.db
          .query('marbleDocuments')
          .withIndex('by_category', (q) => q.eq('category', category))
          .collect()
      : await ctx.db.query('marbleDocuments').collect()
    const filtered = args.folder
      ? documents.filter((document) => document.folder === args.folder)
      : documents
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt)
  },
})

export const getDocumentBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    assertSlug(args.slug)
    const document = await documentBySlug(ctx, args.slug)
    if (!document) return null
    const [shares, intents] = await Promise.all([
      sharesFor(ctx, args.slug),
      intentsFor(ctx, args.slug),
    ])
    return { document, shares, intents }
  },
})

export const saveDocument = mutation({
  args: {
    slug: v.string(),
    source: v.string(),
    fileName: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(marbleCategory),
    isTemplate: v.optional(v.boolean()),
    nodeCount: v.optional(v.number()),
    byteSize: v.optional(v.number()),
    version: v.optional(v.number()),
    starred: v.optional(v.boolean()),
    pinned: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    folder: v.optional(v.string()),
    sharePermission: v.optional(sharePermission),
    allowDuplication: v.optional(v.boolean()),
    sharedAiDailyLimit: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertSlug(args.slug)
    const fileName = args.fileName ?? `${args.slug}.mrbl`
    assertFileName(fileName)
    const existing = await documentBySlug(ctx, args.slug)
    const updatedAt = args.updatedAt ?? Date.now()
    const fields = {
      fileName,
      title: args.title ?? existing?.title ?? args.slug,
      description: args.description ?? existing?.description ?? '',
      category: args.category ?? existing?.category ?? 'document',
      isTemplate: args.isTemplate ?? existing?.isTemplate ?? false,
      source: args.source,
      nodeCount: args.nodeCount ?? countNodes(args.source),
      byteSize: args.byteSize ?? byteSizeOf(args.source),
      version: args.version ?? (existing ? existing.version + 1 : 1),
      starred: args.starred ?? existing?.starred ?? false,
      pinned: args.pinned ?? existing?.pinned ?? false,
      tags: args.tags ?? existing?.tags ?? [],
      folder: args.folder ?? existing?.folder ?? '',
      sharePermission:
        args.sharePermission ?? existing?.sharePermission ?? 'view_only',
      allowDuplication:
        args.allowDuplication ?? existing?.allowDuplication ?? true,
      sharedAiDailyLimit:
        args.sharedAiDailyLimit ?? existing?.sharedAiDailyLimit ?? 0,
      updatedAt,
    } as const
    if (existing) {
      await ctx.db.patch(existing._id, fields)
      return { id: existing._id, slug: args.slug, version: fields.version }
    }
    const id = await ctx.db.insert('marbleDocuments', {
      slug: args.slug,
      ...fields,
    })
    return { id, slug: args.slug, version: fields.version }
  },
})

export const duplicateTemplate = mutation({
  args: {
    templateSlug: v.string(),
    slug: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    folder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertSlug(args.templateSlug)
    assertSlug(args.slug)
    if (args.templateSlug === args.slug) {
      throw new Error('Duplicate slug must differ from the template slug')
    }
    const template = await documentBySlug(ctx, args.templateSlug)
    if (!template) {
      throw new Error(`No document for slug "${args.templateSlug}"`)
    }
    if (!template.isTemplate) {
      throw new Error(`"${args.templateSlug}" is not a template`)
    }
    const existing = await documentBySlug(ctx, args.slug)
    if (existing) {
      throw new Error(`Slug "${args.slug}" is already in use`)
    }
    const updatedAt = Date.now()
    const id = await ctx.db.insert('marbleDocuments', {
      slug: args.slug,
      fileName: `${args.slug}.mrbl`,
      title: args.title ?? template.title,
      description: args.description ?? template.description,
      category: template.category,
      isTemplate: false,
      source: template.source,
      nodeCount: template.nodeCount,
      byteSize: template.byteSize,
      version: 1,
      starred: false,
      pinned: false,
      tags: [...template.tags],
      folder: args.folder ?? template.folder,
      sharePermission: 'view_only',
      allowDuplication: template.allowDuplication,
      sharedAiDailyLimit: 0,
      updatedAt,
    })
    return { id, slug: args.slug, version: 1, updatedAt }
  },
})

export const applyDocumentOps = mutation({
  args: {
    slug: v.string(),
    source: v.string(),
    nodeCount: v.optional(v.number()),
    byteSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertSlug(args.slug)
    const document = await documentBySlug(ctx, args.slug)
    if (!document) {
      throw new Error(`No document for slug "${args.slug}"`)
    }
    const updatedAt = Date.now()
    const version = document.version + 1
    const nodeCount = args.nodeCount ?? countNodes(args.source)
    const byteSize = args.byteSize ?? byteSizeOf(args.source)
    await ctx.db.patch(document._id, {
      source: args.source,
      nodeCount,
      byteSize,
      version,
      updatedAt,
    })
    return {
      id: document._id,
      slug: args.slug,
      version,
      nodeCount,
      byteSize,
      updatedAt,
    }
  },
})

const collaborator = v.object({
  email: v.string(),
  name: v.string(),
  permission: sharePermission,
})

export const updateShareConfig = mutation({
  args: {
    slug: v.string(),
    sharePermission: v.optional(sharePermission),
    allowDuplication: v.optional(v.boolean()),
    sharedAiDailyLimit: v.optional(v.number()),
    collaborators: v.optional(v.array(collaborator)),
  },
  handler: async (ctx, args) => {
    assertSlug(args.slug)
    const document = await documentBySlug(ctx, args.slug)
    if (!document) {
      throw new Error(`No document for slug "${args.slug}"`)
    }
    const patch: {
      sharePermission?: typeof args.sharePermission
      allowDuplication?: boolean
      sharedAiDailyLimit?: number
      updatedAt: number
    } = { updatedAt: Date.now() }
    if (args.sharePermission !== undefined) {
      patch.sharePermission = args.sharePermission
    }
    if (args.allowDuplication !== undefined) {
      patch.allowDuplication = args.allowDuplication
    }
    if (args.sharedAiDailyLimit !== undefined) {
      patch.sharedAiDailyLimit = args.sharedAiDailyLimit
    }
    await ctx.db.patch(document._id, patch)

    let shares = await sharesFor(ctx, args.slug)
    if (args.collaborators) {
      for (const share of shares) {
        await ctx.db.delete(share._id)
      }
      const addedAt = Date.now()
      const seen = new Set<string>()
      for (const person of args.collaborators) {
        const email = person.email.trim().toLowerCase()
        if (!email || seen.has(email)) continue
        seen.add(email)
        await ctx.db.insert('marbleShares', {
          documentSlug: args.slug,
          email,
          name: person.name.trim() || email,
          permission: person.permission,
          addedAt,
        })
      }
      shares = await sharesFor(ctx, args.slug)
    }

    const next = await documentBySlug(ctx, args.slug)
    return { document: next, shares }
  },
})

export const recordIntent = mutation({
  args: {
    documentSlug: v.string(),
    instruction: v.string(),
    note: v.optional(v.string()),
    modelId: v.string(),
    providerId: aiProviderId,
    opsJson: v.string(),
    status: v.optional(intentStatus),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertSlug(args.documentSlug)
    const document = await documentBySlug(ctx, args.documentSlug)
    if (!document) {
      throw new Error(`No document for slug "${args.documentSlug}"`)
    }
    const createdAt = args.createdAt ?? Date.now()
    const id = await ctx.db.insert('marbleIntents', {
      documentSlug: args.documentSlug,
      instruction: args.instruction,
      note: args.note ?? '',
      modelId: args.modelId,
      providerId: args.providerId,
      opsJson: args.opsJson,
      status: args.status ?? 'proposed',
      createdAt,
    })
    return {
      id,
      documentSlug: args.documentSlug,
      status: args.status ?? 'proposed',
      createdAt,
    }
  },
})
