import { useMemo } from 'react'
import {
  Outlet,
  createFileRoute,
  useLocation,
  useMatches,
  useSearch,
} from '@tanstack/react-router'
import { XDriveWorkspace } from '#/components/workspace'
import {
  WorkspaceRouteProvider,
  isSettingsProviderId,
  workspaceSearchSchema,
} from '#/lib/routing'
import type {
  WorkspaceRouteContextValue,
  WorkspaceRouteMatch,
} from '#/lib/routing'

export const Route = createFileRoute('/_workspace')({
  validateSearch: workspaceSearchSchema,
  component: WorkspaceLayout,
})

function resolveWorkspaceMatch(
  matches: ReadonlyArray<{
    routeId: string
    params: Record<string, unknown>
  }>,
  pathname: string,
): WorkspaceRouteMatch {
  const leaf = matches.at(-1)
  const routeId = leaf?.routeId ?? ''
  const params = leaf?.params ?? {}

  if (routeId === '/_workspace/drive') {
    return { kind: 'drive' }
  }
  if (routeId === '/_workspace/f/$folderId/') {
    return {
      kind: 'folder',
      folderId: String(params.folderId ?? ''),
    }
  }
  if (routeId === '/_workspace/f/$folderId/$slug') {
    return {
      kind: 'folder',
      folderId: String(params.folderId ?? ''),
      slug: String(params.slug ?? ''),
    }
  }
  if (routeId === '/_workspace/d/$docId/') {
    return {
      kind: 'doc',
      docId: String(params.docId ?? ''),
    }
  }
  if (routeId === '/_workspace/d/$docId/$slug') {
    return {
      kind: 'doc',
      docId: String(params.docId ?? ''),
      slug: String(params.slug ?? ''),
    }
  }
  if (routeId === '/_workspace/starred') {
    return { kind: 'starred' }
  }
  if (routeId === '/_workspace/shared') {
    return { kind: 'shared' }
  }
  if (routeId === '/_workspace/trash') {
    return { kind: 'trash' }
  }
  if (routeId === '/_workspace/templates') {
    return { kind: 'templates' }
  }
  if (routeId === '/_workspace/search') {
    return { kind: 'search' }
  }
  if (routeId === '/_workspace/chat/') {
    return { kind: 'chat' }
  }
  if (routeId === '/_workspace/chat/$threadId') {
    return {
      kind: 'chat',
      threadId: String(params.threadId ?? ''),
    }
  }
  if (routeId === '/_workspace/settings/models/') {
    return {
      kind: 'settings',
      providerId: 'antigravity',
      isExplicitProvider: false,
    }
  }
  if (routeId === '/_workspace/settings/models/$providerId') {
    const providerParam = String(params.providerId ?? '')
    if (isSettingsProviderId(providerParam)) {
      return {
        kind: 'settings',
        providerId: providerParam,
        isExplicitProvider: true,
      }
    }
    return {
      kind: 'not-found',
      section: 'settings',
      path: pathname,
    }
  }
  if (routeId === '/_workspace/settings/backup') {
    return { kind: 'settings-backup' }
  }
  if (routeId === '/_workspace/settings/$') {
    return {
      kind: 'not-found',
      section: 'settings',
      path: pathname,
    }
  }
  return {
    kind: 'not-found',
    section: 'workspace',
    path: pathname,
  }
}

function WorkspaceLayout() {
  const matches = useMatches()
  const location = useLocation()
  const rawSearch = useSearch({ strict: false })

  const routeValue = useMemo<WorkspaceRouteContextValue>(() => {
    const match = resolveWorkspaceMatch(
      matches.map((m) => ({
        routeId: m.routeId,
        params: m.params,
      })),
      location.pathname,
    )
    return {
      routed: true,
      match,
      search: rawSearch,
      pathname: location.pathname,
    }
  }, [matches, location.pathname, rawSearch])

  return (
    <WorkspaceRouteProvider value={routeValue}>
      <XDriveWorkspace syncWithServer />
      <Outlet />
    </WorkspaceRouteProvider>
  )
}
