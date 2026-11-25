import { createFileRoute } from '@tanstack/react-router'

import {
  ChatStorageError,
  createChatThread,
  importChatThreads,
  listChatThreads,
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

export async function GET() {
  try {
    const threads = await listChatThreads()
    return json({ ok: true, threads })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST({ request }: { request: Request }) {
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
    if (body.action === 'import') {
      const result = await importChatThreads(body.threads)
      return json({ ok: true, ...result })
    }
    const thread = await createChatThread(body)
    return json({ ok: true, thread }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/drive-chat/threads')({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
})
