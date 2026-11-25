import { createFileRoute } from '@tanstack/react-router'

import {
  ChatStorageError,
  deleteDocChatHistory,
  readDocChatHistory,
  saveDocChatHistory,
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

export async function GET({ params }: { params: { docId: string } }) {
  try {
    const record = await readDocChatHistory(params.docId)
    return json({
      ok: true,
      docId: params.docId,
      messages: record?.messages ?? [],
      updatedAt: record?.updatedAt ?? null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT({
  request,
  params,
}: {
  request: Request
  params: { docId: string }
}) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json(
        { ok: false, error: 'Request body must be a JSON object' },
        400,
      )
    }
    body = parsed as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'Request body must be valid JSON' }, 400)
  }

  try {
    const saved = await saveDocChatHistory(params.docId, body.messages)
    return json({ ok: true, ...saved })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE({ params }: { params: { docId: string } }) {
  try {
    const result = await deleteDocChatHistory(params.docId)
    return json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/ai/history/$docId')({
  server: {
    handlers: {
      GET,
      PUT,
      DELETE,
    },
  },
})
