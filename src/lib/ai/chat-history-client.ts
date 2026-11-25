// Browser-side client helpers for persisting Drive Chat threads and
// per-document AI collaborator sidebar histories on the server.

import type { DriveChatThread } from '#/lib/ai/drive-chat-types'
import type { AIMessage } from '#/lib/types'

export function sanitizeThreadForPersistence(
  thread: DriveChatThread,
): DriveChatThread {
  return {
    ...thread,
    messages: thread.messages.map((msg) => ({
      ...msg,
      isStreaming: false,
      streamingPhase: undefined,
    })),
  }
}

export async function fetchDriveChatThreads(): Promise<
  DriveChatThread[] | null
> {
  try {
    const response = await fetch('/api/drive-chat/threads', {
      cache: 'no-store',
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      ok?: boolean
      threads?: DriveChatThread[]
    }
    if (!data.ok || !Array.isArray(data.threads)) return null
    return data.threads
  } catch {
    return null
  }
}

export async function fetchDriveChatThread(
  threadId: string,
): Promise<DriveChatThread | null> {
  try {
    const response = await fetch(
      `/api/drive-chat/threads/${encodeURIComponent(threadId)}`,
      { cache: 'no-store' },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      ok?: boolean
      thread?: DriveChatThread
    }
    if (!data.ok || !data.thread) return null
    return data.thread
  } catch {
    return null
  }
}

export async function saveDriveChatThread(
  thread: DriveChatThread,
): Promise<DriveChatThread | null> {
  try {
    const response = await fetch(
      `/api/drive-chat/threads/${encodeURIComponent(thread.id)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sanitizeThreadForPersistence(thread)),
      },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      ok?: boolean
      thread?: DriveChatThread
    }
    if (!data.ok || !data.thread) return null
    return data.thread
  } catch {
    return null
  }
}

export async function patchDriveChatThread(
  threadId: string,
  patch: Partial<
    Pick<
      DriveChatThread,
      | 'title'
      | 'pinned'
      | 'modelId'
      | 'reasoningEffort'
      | 'mode'
      | 'messages'
      | 'updatedAt'
    >
  >,
): Promise<DriveChatThread | null> {
  try {
    const response = await fetch(
      `/api/drive-chat/threads/${encodeURIComponent(threadId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      ok?: boolean
      thread?: DriveChatThread
    }
    if (!data.ok || !data.thread) return null
    return data.thread
  } catch {
    return null
  }
}

export async function deleteDriveChatThread(
  threadId: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/drive-chat/threads/${encodeURIComponent(threadId)}`,
      { method: 'DELETE' },
    )
    return response.ok
  } catch {
    return false
  }
}

export async function importDriveChatThreads(
  threads: DriveChatThread[],
): Promise<{
  imported: number
  skipped: number
  threads: DriveChatThread[]
} | null> {
  try {
    const response = await fetch('/api/drive-chat/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'import',
        threads: threads.map(sanitizeThreadForPersistence),
      }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      ok?: boolean
      imported?: number
      skipped?: number
      threads?: DriveChatThread[]
    }
    if (!data.ok || !Array.isArray(data.threads)) return null
    return {
      imported: data.imported ?? 0,
      skipped: data.skipped ?? 0,
      threads: data.threads,
    }
  } catch {
    return null
  }
}

export async function fetchDocChatHistories(): Promise<Record<
  string,
  AIMessage[]
> | null> {
  try {
    const response = await fetch('/api/ai/history', { cache: 'no-store' })
    if (!response.ok) return null
    const data = (await response.json()) as {
      ok?: boolean
      threads?: Record<string, AIMessage[]>
    }
    if (!data.ok || !data.threads || typeof data.threads !== 'object') {
      return null
    }
    return data.threads
  } catch {
    return null
  }
}

export async function saveDocChatHistory(
  docId: string,
  messages: AIMessage[],
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/ai/history/${encodeURIComponent(docId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages }),
      },
    )
    return response.ok
  } catch {
    return false
  }
}

export async function deleteDocChatHistory(docId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/ai/history/${encodeURIComponent(docId)}`,
      { method: 'DELETE' },
    )
    return response.ok
  } catch {
    return false
  }
}
