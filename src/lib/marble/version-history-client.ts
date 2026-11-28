import type {
  CreateVersionResult,
  DocumentVersionDetail,
  DocumentVersionSummary,
  RestoreVersionResult,
} from './version-history-types'

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    ({ ok?: boolean; error?: string } & T) | null
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(
      payload?.error ?? `Version history request failed (${response.status})`,
    )
  }
  return payload
}

export async function listVersions(
  docId: string,
): Promise<DocumentVersionSummary[]> {
  const params = new URLSearchParams({ docId })
  const response = await fetch(`/api/versions?${params.toString()}`, {
    cache: 'no-store',
  })
  const data = await parseJsonResponse<{
    versions: DocumentVersionSummary[]
  }>(response)
  return data.versions
}

export async function getVersion(
  docId: string,
  versionId: string,
): Promise<DocumentVersionDetail> {
  const params = new URLSearchParams({ docId, versionId })
  const response = await fetch(`/api/versions?${params.toString()}`, {
    cache: 'no-store',
  })
  const data = await parseJsonResponse<{
    version: DocumentVersionDetail
  }>(response)
  return data.version
}

export async function createVersion(input: {
  docId: string
  slug?: string
  folderPath?: string | null
  source?: string
  label: string
  author?: string
  title?: string
}): Promise<CreateVersionResult> {
  const response = await fetch('/api/versions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'create',
      docId: input.docId,
      slug: input.slug,
      folderPath: input.folderPath ?? undefined,
      source: input.source,
      label: input.label,
      author: input.author,
      title: input.title,
    }),
  })
  return parseJsonResponse<CreateVersionResult>(response)
}

export async function restoreVersion(input: {
  docId: string
  versionId: string
  slug?: string
  folderPath?: string | null
  author?: string
}): Promise<RestoreVersionResult> {
  const response = await fetch('/api/versions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'restore',
      docId: input.docId,
      versionId: input.versionId,
      slug: input.slug,
      folderPath: input.folderPath ?? undefined,
      author: input.author,
    }),
  })
  return parseJsonResponse<RestoreVersionResult>(response)
}
