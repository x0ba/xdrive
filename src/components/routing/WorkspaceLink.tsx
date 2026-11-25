import type React from 'react'
import { useRouter } from '@tanstack/react-router'
import { isModifiedClick, useWorkspaceRoute } from '#/lib/routing'

export interface WorkspaceLinkProps extends Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> {
  href: string
  /**
   * Optional handler invoked on unmodified primary click.
   * When inside a routed workspace (`_workspace.tsx`), if `onNavigate` is omitted
   * the link navigates via TanStack Router (`router.navigate({ href })`) without a full reload.
   * When `onNavigate` is provided (e.g. standalone Storybook demos or custom handlers),
   * unmodified left-click invokes `onNavigate` while Cmd/Ctrl/middle-click still opens `href` natively.
   */
  onNavigate?: () => void
  replace?: boolean
}

/**
 * Real HTML `<a>` link that preserves native browser semantics (Cmd/Ctrl-click,
 * middle-click, right-click copy link, hover URL preview) while performing
 * client-side TanStack Router navigation in the routed workspace and cleanly
 * supporting callback-driven standalone Storybook demos.
 */
export function WorkspaceLink({
  href,
  onNavigate,
  onClick,
  replace = false,
  ...rest
}: WorkspaceLinkProps) {
  const workspaceRoute = useWorkspaceRoute()
  const router = useRouter()

  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (isModifiedClick(event)) return

        event.preventDefault()
        if (onNavigate) {
          onNavigate()
          return
        }
        if (workspaceRoute?.routed) {
          void router.navigate({ href, replace })
        }
      }}
      {...rest}
    />
  )
}
