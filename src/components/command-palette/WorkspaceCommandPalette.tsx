import { useEffect, useMemo, useRef } from 'react'
import { CommandPalette } from './CommandPalette'
import { defaultCommandRegistry } from './registry'
import type { CommandSourceRegistry } from './registry'
import {
  isCommandPaletteShortcut,
  shouldIgnoreCommandPaletteShortcut,
} from './shortcuts'
import { createBuiltinCommandSources } from './sources'
import type { WorkspaceCommandSourceDeps } from './sources'
import type { CommandContext } from './types'

export interface WorkspaceCommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: Omit<CommandContext, 'signal'>
  deps: WorkspaceCommandSourceDeps
  registry?: CommandSourceRegistry
  placeholder?: string
}

export function WorkspaceCommandPalette({
  open,
  onOpenChange,
  context,
  deps,
  registry = defaultCommandRegistry,
  placeholder,
}: WorkspaceCommandPaletteProps) {
  const openRef = useRef(open)
  openRef.current = open

  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isCommandPaletteShortcut(event)) return
      if (
        shouldIgnoreCommandPaletteShortcut(event, {
          isOpen: openRef.current,
        })
      ) {
        return
      }
      event.preventDefault()
      onOpenChangeRef.current(!openRef.current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const builtinSources = useMemo(
    () => createBuiltinCommandSources(deps),
    [deps],
  )

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      sources={builtinSources}
      registry={registry}
      context={context}
      placeholder={placeholder}
    />
  )
}
