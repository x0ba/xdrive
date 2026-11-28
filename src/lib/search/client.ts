import type { SearchDriveOptions, SearchDriveResponse } from './types'

export class DriveSearchError extends Error {
  readonly status?: number
  readonly code: 'HTTP_ERROR' | 'UNAVAILABLE' | 'INVALID_RESPONSE'

  constructor(
    message: string,
    options: {
      status?: number
      code: 'HTTP_ERROR' | 'UNAVAILABLE' | 'INVALID_RESPONSE'
    },
  ) {
    super(message)
    this.name = 'DriveSearchError'
    this.status = options.status
    this.code = options.code
  }
}

/**
 * Query `/api/search` over HTTP. Throws `DriveSearchError` with
 * `code: 'UNAVAILABLE'` when the endpoint does not return JSON (such as
 * static Storybook builds), or `code: 'HTTP_ERROR'` on server errors.
 */
export async function fetchDriveSearch(
  options: SearchDriveOptions,
  init?: { signal?: AbortSignal },
): Promise<SearchDriveResponse> {
  const params = new URLSearchParams()
  params.set('q', options.query)
  if (options.types && options.types.length > 0) {
    params.set('types', options.types.join(','))
  }
  if (options.includeTrash) {
    params.set('includeTrash', '1')
  }
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    params.set('limit', String(options.limit))
  }
  if (typeof options.offset === 'number' && Number.isFinite(options.offset)) {
    params.set('offset', String(options.offset))
  }

  let response: Response
  try {
    response = await fetch(`/api/search?${params.toString()}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: init?.signal,
    })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError'
    ) {
      throw error
    }
    throw new DriveSearchError(
      error instanceof Error ? error.message : 'Search request failed',
      { code: 'UNAVAILABLE' },
    )
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new DriveSearchError('Search API is unavailable', {
      status: response.status,
      code: 'UNAVAILABLE',
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new DriveSearchError('Search API returned invalid JSON', {
      status: response.status,
      code: 'INVALID_RESPONSE',
    })
  }

  if (!response.ok) {
    const errMsg =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Search request failed (HTTP ${response.status})`
    throw new DriveSearchError(errMsg, {
      status: response.status,
      code: 'HTTP_ERROR',
    })
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload as { ok?: unknown }).ok !== true ||
    !Array.isArray((payload as { results?: unknown }).results)
  ) {
    throw new DriveSearchError('Unexpected search response shape', {
      status: response.status,
      code: 'INVALID_RESPONSE',
    })
  }

  const rec = payload as SearchDriveResponse & { ok: true }
  return {
    query: rec.query,
    terms: rec.terms,
    results: rec.results,
    total: rec.total,
    counts: rec.counts,
    tookMs: rec.tookMs,
    indexedCount: rec.indexedCount,
  }
}
