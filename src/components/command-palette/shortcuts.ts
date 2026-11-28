import { useEffect, useState } from 'react'

export interface PlatformLikeNavigator {
  platform?: string
  userAgent?: string
  userAgentData?: { platform?: string }
}

interface ElementLike {
  tagName?: string
  isContentEditable?: boolean
  getAttribute?: (name: string) => string | null
  closest?: (selector: string) => unknown
}

function asElementLike(target: unknown): ElementLike | null {
  if (!target || typeof target !== 'object') return null
  if (!('tagName' in target) && !('closest' in target)) return null
  return target as ElementLike
}

export function isMacPlatform(nav?: PlatformLikeNavigator | null): boolean {
  const source: PlatformLikeNavigator | null =
    nav ?? (typeof navigator !== 'undefined' ? navigator : null)
  if (!source) return true
  const raw =
    source.userAgentData?.platform ?? source.platform ?? source.userAgent ?? ''
  return /mac|iphone|ipad|ipod/i.test(raw)
}

export function getCommandPaletteShortcutKeys(isMac: boolean): string[] {
  return isMac ? ['⌘', 'K'] : ['Ctrl', 'K']
}

export function formatCommandPaletteShortcut(isMac: boolean): string {
  return isMac ? '⌘K' : 'Ctrl K'
}

export function isCommandPaletteShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
  >,
): boolean {
  if (event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.key.toLowerCase() === 'k'
}

/**
 * Guard global Cmd/Ctrl-K handling so we don't hijack rich text editors,
 * CodeMirror, tldraw shape text boxes, IME composition, or already-claimed shortcuts
 * (such as NotesApp's Cmd-K Markdown link insertion).
 */
export function shouldIgnoreCommandPaletteShortcut(
  event: Pick<KeyboardEvent, 'defaultPrevented' | 'isComposing' | 'target'>,
  options: { isOpen: boolean },
): boolean {
  if (options.isOpen) return false
  if (event.defaultPrevented || event.isComposing) return true

  const el = asElementLike(event.target)
  if (!el) return false

  if (el.closest?.('[data-command-palette-ignore="true"]')) {
    return true
  }

  if (
    el.isContentEditable ||
    el.getAttribute?.('contenteditable') === 'true' ||
    el.getAttribute?.('contenteditable') === '' ||
    el.closest?.(
      '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]',
    )
  ) {
    return true
  }

  if (el.closest?.('.cm-editor')) {
    return true
  }

  const tag = (el.tagName ?? '').toUpperCase()
  if (
    el.closest?.('.tl-container, [data-testid="whiteboard-canvas"]') &&
    (tag === 'TEXTAREA' || tag === 'INPUT')
  ) {
    return true
  }

  if (
    el.closest?.('[role="dialog"]') &&
    !el.closest('[data-command-palette-dialog="true"]')
  ) {
    return true
  }

  return false
}

export function useCommandPaletteShortcutLabel(): {
  isMac: boolean
  keys: string[]
  label: string
} {
  const [isMac, setIsMac] = useState(true)

  useEffect(() => {
    setIsMac(isMacPlatform())
  }, [])

  return {
    isMac,
    keys: getCommandPaletteShortcutKeys(isMac),
    label: formatCommandPaletteShortcut(isMac),
  }
}
