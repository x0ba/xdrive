import { createFileRoute } from '@tanstack/react-router'

import {
  ChatStorageError,
  listDocChatHistories,
  readDocChatHistory,
} from '#/lib/ai/chat-storage.server'

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function errorResponse(error: unknown) {
  const status = error instanceof ChatStorageError ? error.status : 400
  const message =
    error instanceof Error ? error.message : 'Collaborator history failed'
  return json({ ok: false, error: message }, status)
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url)
  const docId = url.searchParams.get('docId')
  try {
    if (docId) {
      const record = await readDocChatHistory(docId)
      return json({
        ok: true,
        docId,
        messages: record?.messages ?? [],
        updatedAt: record?.updatedAt ?? null,
      })
    }
    const threads = await listDocChatHistories()
    return json({ ok: true, threads })
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/ai/history')({
  server: {
    handlers: {
      GET,
    },
  },
})
