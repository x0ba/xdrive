import { describe, expect, it } from 'vitest'
import {
  formatCommandPaletteShortcut,
  getCommandPaletteShortcutKeys,
  isCommandPaletteShortcut,
  isMacPlatform,
  shouldIgnoreCommandPaletteShortcut,
} from './shortcuts'

function mockElement(
  opts: {
    tagName?: string
    isContentEditable?: boolean
    matchesSelectors?: string[]
  } = {},
) {
  const selectors = new Set(opts.matchesSelectors ?? [])
  return {
    tagName: opts.tagName ?? 'DIV',
    isContentEditable: Boolean(opts.isContentEditable),
    getAttribute: () => null,
    closest: (selector: string) => {
      for (const candidate of selector.split(',').map((s) => s.trim())) {
        if (selectors.has(candidate)) return {}
      }
      return null
    },
  }
}

describe('platform & shortcut detection', () => {
  it('detects Mac vs Linux/Windows platforms and formats shortcut labels', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true)
    expect(isMacPlatform({ platform: 'Linux x86_64' })).toBe(false)
    expect(isMacPlatform({ userAgent: 'Windows NT 10.0' })).toBe(false)

    expect(formatCommandPaletteShortcut(true)).toBe('⌘K')
    expect(formatCommandPaletteShortcut(false)).toBe('Ctrl K')
    expect(getCommandPaletteShortcutKeys(true)).toEqual(['⌘', 'K'])
    expect(getCommandPaletteShortcutKeys(false)).toEqual(['Ctrl', 'K'])
  })

  it('recognizes Cmd-K and Ctrl-K without Shift or Alt', () => {
    expect(
      isCommandPaletteShortcut({
        key: 'k',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true)
    expect(
      isCommandPaletteShortcut({
        key: 'K',
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true)
    expect(
      isCommandPaletteShortcut({
        key: 'k',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBe(false)
  })
})

describe('shouldIgnoreCommandPaletteShortcut', () => {
  it('ignores shortcuts already prevented by an editor (e.g. NotesApp link Cmd-K)', () => {
    expect(
      shouldIgnoreCommandPaletteShortcut(
        {
          defaultPrevented: true,
          isComposing: false,
          target: mockElement({
            tagName: 'TEXTAREA',
          }) as unknown as EventTarget,
        },
        { isOpen: false },
      ),
    ).toBe(true)
  })

  it('ignores contentEditable editors, CodeMirror, and tldraw text inputs', () => {
    expect(
      shouldIgnoreCommandPaletteShortcut(
        {
          defaultPrevented: false,
          isComposing: false,
          target: mockElement({
            tagName: 'DIV',
            isContentEditable: true,
          }) as unknown as EventTarget,
        },
        { isOpen: false },
      ),
    ).toBe(true)

    expect(
      shouldIgnoreCommandPaletteShortcut(
        {
          defaultPrevented: false,
          isComposing: false,
          target: mockElement({
            tagName: 'DIV',
            matchesSelectors: ['.cm-editor'],
          }) as unknown as EventTarget,
        },
        { isOpen: false },
      ),
    ).toBe(true)

    expect(
      shouldIgnoreCommandPaletteShortcut(
        {
          defaultPrevented: false,
          isComposing: false,
          target: mockElement({
            tagName: 'TEXTAREA',
            matchesSelectors: ['.tl-container'],
          }) as unknown as EventTarget,
        },
        { isOpen: false },
      ),
    ).toBe(true)
  })

  it('allows Cmd/Ctrl-K on the tldraw canvas surface when not typing in a text box', () => {
    expect(
      shouldIgnoreCommandPaletteShortcut(
        {
          defaultPrevented: false,
          isComposing: false,
          target: mockElement({
            tagName: 'DIV',
            matchesSelectors: ['.tl-container'],
          }) as unknown as EventTarget,
        },
        { isOpen: false },
      ),
    ).toBe(false)
  })

  it('ignores when another modal dialog is open, but allows toggling off when palette itself is open', () => {
    expect(
      shouldIgnoreCommandPaletteShortcut(
        {
          defaultPrevented: false,
          isComposing: false,
          target: mockElement({
            tagName: 'INPUT',
            matchesSelectors: ['[role="dialog"]'],
          }) as unknown as EventTarget,
        },
        { isOpen: false },
      ),
    ).toBe(true)

    expect(
      shouldIgnoreCommandPaletteShortcut(
        {
          defaultPrevented: true,
          isComposing: false,
          target: mockElement({
            tagName: 'INPUT',
            matchesSelectors: ['[role="dialog"]'],
          }) as unknown as EventTarget,
        },
        { isOpen: true },
      ),
    ).toBe(false)
  })
})
