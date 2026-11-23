import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  Bold,
  Copy,
  FilePlus,
  Highlighter,
  Italic,
  Pin,
  Table2,
  Trash2,
  Type,
  Underline,
} from 'lucide-react'
import {
  AppContextMenu,
  AppMenuBar,
  ColorPalettePopover,
  FontSizeControl,
  TableGridPicker,
  ToolbarButton,
  ToolbarDivider,
  ToolbarDropdown,
} from './EditorChrome'
import type { ContextMenuItem, MenuBarGroup } from './EditorChrome'

const SAMPLE_MENUS: MenuBarGroup[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      {
        id: 'new',
        label: 'New document',
        icon: <FilePlus className="h-3.5 w-3.5" />,
        shortcut: '⌘N',
      },
      {
        id: 'dup',
        label: 'Make a copy',
        icon: <Copy className="h-3.5 w-3.5" />,
      },
      { id: 'sep1', label: '', divider: true },
      {
        id: 'delete',
        label: 'Move to trash',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
      },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { id: 'undo', label: 'Undo', shortcut: '⌘Z' },
      { id: 'redo', label: 'Redo', shortcut: '⌘⇧Z' },
      { id: 'sep2', label: '', divider: true },
      { id: 'find', label: 'Find and replace', shortcut: '⌘H' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { id: 'ruler', label: 'Show ruler', checked: true },
      { id: 'outline', label: 'Show outline', checked: true },
    ],
  },
]

function FormattingControlsStripDemo() {
  const [bold, setBold] = useState(true)
  const [italic, setItalic] = useState(false)
  const [underline, setUnderline] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [textColor, setTextColor] = useState('#5e6ad2')
  const [highlight, setHighlight] = useState('transparent')
  const [lastTable, setLastTable] = useState<string | null>(null)

  return (
    <div className="space-y-3 rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3">
      <div className="flex flex-wrap items-center gap-1">
        <FontSizeControl value={fontSize} onChange={setFontSize} />
        <ToolbarDivider />
        <ToolbarButton
          title="Bold"
          active={bold}
          onClick={() => setBold((v) => !v)}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={italic}
          onClick={() => setItalic((v) => !v)}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={underline}
          onClick={() => setUnderline((v) => !v)}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarDivider />
        <ColorPalettePopover
          title="Text color"
          value={textColor}
          onChange={setTextColor}
          icon={<Type className="h-3.5 w-3.5" />}
        />
        <ColorPalettePopover
          title="Highlight color"
          value={highlight}
          onChange={setHighlight}
          icon={<Highlighter className="h-3.5 w-3.5" />}
        />
        <ToolbarDivider />
        <ToolbarDropdown
          title="Insert table"
          trigger={<Table2 className="h-3.5 w-3.5" />}
        >
          {(close) => (
            <TableGridPicker
              onSelect={(r, c) => {
                setLastTable(`${r} × ${c}`)
                close()
              }}
            />
          )}
        </ToolbarDropdown>
      </div>
      {lastTable && (
        <p className="text-[11.5px] text-[var(--xd-ink-muted)]">
          Selected table dimensions: {lastTable}
        </p>
      )}
    </div>
  )
}

function RightClickContextMenuDemo() {
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  })
  const [lastAction, setLastAction] = useState(
    'Right-click the row below to inspect actions.',
  )

  const items: ContextMenuItem[] = [
    {
      id: 'pin',
      label: 'Pin note',
      icon: <Pin className="h-3.5 w-3.5" />,
      onSelect: () => setLastAction('Pinned note'),
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: <Copy className="h-3.5 w-3.5" />,
      shortcut: '⌘D',
      onSelect: () => setLastAction('Duplicated note'),
    },
    { id: 'sep', label: '', divider: true },
    {
      id: 'delete',
      label: 'Delete note',
      icon: <Trash2 className="h-3.5 w-3.5" />,
      danger: true,
      onSelect: () => setLastAction('Deleted note'),
    },
  ]

  return (
    <div className="space-y-3">
      <div
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ open: true, x: e.clientX, y: e.clientY })
        }}
        className="max-w-xs cursor-context-menu rounded-md border border-[var(--xd-border)] bg-[var(--xd-rail)] p-3"
      >
        <div className="text-[13px] font-medium text-[var(--xd-ink)]">
          Hypothesis &amp; Ablations
        </div>
        <div className="mt-0.5 text-[11.5px] text-[var(--xd-ink-muted)]">
          10:42 AM · The early-layer heads are doing position, not semantics.
        </div>
      </div>
      <p className="text-[12px] text-[var(--xd-ink-secondary)]">{lastAction}</p>
      <AppContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        items={items}
        onClose={() => setMenu((m) => ({ ...m, open: false }))}
      />
    </div>
  )
}

/**
 * Shared precision chrome primitives used across Notes, Docs, and Slides editors.
 *
 * @summary Shared editor menu bars, toolbars, color pickers, and context menus
 */
const meta = {
  title: 'xDrive Apps/Shared Editor Primitives',
  component: AppMenuBar,
  subcomponents: {
    AppContextMenu,
    ColorPalettePopover,
    FontSizeControl,
    TableGridPicker,
    ToolbarButton,
    ToolbarDivider,
    ToolbarDropdown,
  },
  args: {
    menus: SAMPLE_MENUS,
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Shared precision chrome primitives (menu bars, right-click context menus, formatting controls, color pickers, font-size steppers, and table grid pickers) shared across Notes, Docs, and Slides.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AppMenuBar>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Interactive top-level application menu bar with shortcuts, checkmarks, and danger items.
 *
 * @summary Application menu bar with dropdown groups
 */
export const ApplicationMenuBar: Story = {
  args: {
    menus: SAMPLE_MENUS,
  },
}

/**
 * Composed formatting toolbar strip demonstrating font-size stepper, toggles, color popovers, and table grid picker.
 *
 * @summary Formatting toolbar controls strip
 */
export const FormattingControlsStrip: Story = {
  render: () => <FormattingControlsStripDemo />,
}

/**
 * Right-click context menu anchored at pointer coordinates with keyboard shortcuts and destructive actions.
 *
 * @summary Right-click context menu interaction
 */
export const RightClickContextMenu: Story = {
  render: () => <RightClickContextMenuDemo />,
}
