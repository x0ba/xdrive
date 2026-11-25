import { createFileRoute } from '@tanstack/react-router'

import {
  ChatStorageError,
  deleteChatThread,
  patchChatThread,
  readChatThread,
  saveChatThread,
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
    error instanceof Error ? error.message : 'Chat thread request failed'
  return json({ ok: false, error: message }, status)
}

async function parseJsonObject(request: Request) {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    throw new ChatStorageError(400, 'Request body must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ChatStorageError(400, 'Request body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

export async function GET({ params }: { params: { threadId: string } }) {
  try {
    const thread = await readChatThread(params.threadId)
    if (!thread) {
      return json(
        { ok: false, error: `Chat thread "${params.threadId}" not found` },
        404,
      )
    }
    return json({ ok: true, thread })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT({
  request,
  params,
}: {
  request: Request
  params: { threadId: string }
}) {
  try {
    const body = await parseJsonObject(request)
    const thread = await saveChatThread(params.threadId, body)
    return json({ ok: true, thread })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH({
  request,
  params,
}: {
  request: Request
  params: { threadId: string }
}) {
  try {
    const body = await parseJsonObject(request)
    const thread = await patchChatThread(params.threadId, body)
    return json({ ok: true, thread })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE({ params }: { params: { threadId: string } }) {
  try {
    const result = await deleteChatThread(params.threadId)
    return json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/drive-chat/threads/$threadId')({
  server: {
    handlers: {
      GET,
      PUT,
      PATCH,
      DELETE,
    },
  },
})
