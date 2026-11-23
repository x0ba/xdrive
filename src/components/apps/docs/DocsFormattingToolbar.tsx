import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Highlighter,
  Image,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquarePlus,
  Paintbrush,
  Printer,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Type,
  Underline,
  Undo2,
} from 'lucide-react'
import {
  ColorPalettePopover,
  FontSizeControl,
  TableGridPicker,
  ToolbarButton,
  ToolbarDivider,
  ToolbarDropdown,
} from '#/components/apps/shared'
import { cn } from '#/lib/utils'

export const DOCS_FONT_FAMILIES = [
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Newsreader', value: "'Newsreader', Georgia, serif" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
]

export const DOCS_BLOCK_STYLES = [
  { id: 'p', label: 'Normal text', previewClass: 'text-[12.5px]' },
  {
    id: 'title',
    label: 'Title',
    previewClass: 'xd-serif text-[18px] font-medium',
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    previewClass: 'text-[13px] text-[var(--xd-ink-muted)]',
  },
  {
    id: 'h1',
    label: 'Heading 1',
    previewClass: 'xd-serif text-[16px] font-medium',
  },
  {
    id: 'h2',
    label: 'Heading 2',
    previewClass: 'xd-serif text-[14px] font-medium',
  },
  { id: 'h3', label: 'Heading 3', previewClass: 'text-[13px] font-semibold' },
] as const

export interface ActiveFormatState {
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  align: 'left' | 'center' | 'right' | 'justify'
  blockTag: string
  fontFamily: string
  fontSize: number
  textColor: string
  highlightColor: string
}

export interface DocsFormattingToolbarProps {
  format: ActiveFormatState
  zoom: number
  lineSpacing: number
  paintFormatActive: boolean
  disabled?: boolean
  onUndo: () => void
  onRedo: () => void
  onPrint: () => void
  onTogglePaintFormat: () => void
  onZoomChange: (zoom: number) => void
  onBlockStyle: (style: (typeof DOCS_BLOCK_STYLES)[number]['id']) => void
  onFontFamily: (family: string) => void
  onFontSize: (size: number) => void
  onInlineCommand: (
    cmd:
      | 'bold'
      | 'italic'
      | 'underline'
      | 'strikeThrough'
      | 'insertUnorderedList'
      | 'insertOrderedList'
      | 'indent'
      | 'outdent'
      | 'removeFormat'
      | 'justifyLeft'
      | 'justifyCenter'
      | 'justifyRight'
      | 'justifyFull',
  ) => void
  onTextColor: (color: string) => void
  onHighlightColor: (color: string) => void
  onLineSpacing: (spacing: number) => void
  onInsertLink: () => void
  onAddComment: () => void
  onInsertImage: () => void
  onInsertTable: (rows: number, cols: number) => void
  onInsertChecklist: () => void
  onInsertCallout: () => void
}

export function DocsFormattingToolbar({
  format,
  zoom,
  lineSpacing,
  paintFormatActive,
  disabled = false,
  onUndo,
  onRedo,
  onPrint,
  onTogglePaintFormat,
  onZoomChange,
  onBlockStyle,
  onFontFamily,
  onFontSize,
  onInlineCommand,
  onTextColor,
  onHighlightColor,
  onLineSpacing,
  onInsertLink,
  onAddComment,
  onInsertImage,
  onInsertTable,
  onInsertChecklist,
  onInsertCallout,
}: DocsFormattingToolbarProps) {
  const prevent = (e: React.MouseEvent) => e.preventDefault()

  const activeBlockLabel =
    DOCS_BLOCK_STYLES.find((s) => s.id === format.blockTag)?.label ??
    'Normal text'
  const activeFontLabel =
    DOCS_FONT_FAMILIES.find((f) =>
      format.fontFamily.toLowerCase().includes(f.label.toLowerCase()),
    )?.label ?? 'Inter'

  return (
    <div
      role="toolbar"
      aria-label="Document formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-1 select-none"
    >
      <ToolbarButton
        title="Undo (⌘Z)"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={onUndo}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Redo (⌘⇧Z)"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={onRedo}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Print (⌘P)" onMouseDown={prevent} onClick={onPrint}>
        <Printer className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Paint format"
        active={paintFormatActive}
        disabled={disabled}
        onMouseDown={prevent}
        onClick={onTogglePaintFormat}
      >
        <Paintbrush className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarDropdown
        title="Zoom"
        trigger={<span className="xd-tabular w-9 text-left">{zoom}%</span>}
        panelClassName="w-24"
      >
        {(close) => (
          <div className="space-y-0.5">
            {[50, 75, 90, 100, 125, 150, 200].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => {
                  onZoomChange(level)
                  close()
                }}
                className={cn(
                  'xd-tabular flex w-full rounded-xs px-2 py-1 text-left text-[12px] hover:bg-[var(--xd-surface-hover)]',
                  zoom === level &&
                    'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-accent)]',
                )}
              >
                {level}%
              </button>
            ))}
          </div>
        )}
      </ToolbarDropdown>

      <ToolbarDivider />

      <ToolbarDropdown
        title="Styles"
        disabled={disabled}
        trigger={
          <span className="w-[78px] truncate text-left">
            {activeBlockLabel}
          </span>
        }
        panelClassName="w-48"
      >
        {(close) => (
          <div className="space-y-0.5">
            {DOCS_BLOCK_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                onMouseDown={prevent}
                onClick={() => {
                  onBlockStyle(style.id)
                  close()
                }}
                className={cn(
                  'flex w-full items-center rounded-xs px-2 py-1.5 text-left text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]',
                  style.previewClass,
                )}
              >
                {style.label}
              </button>
            ))}
          </div>
        )}
      </ToolbarDropdown>

      <ToolbarDivider />

      <ToolbarDropdown
        title="Font"
        disabled={disabled}
        trigger={
          <span className="w-24 truncate text-left">{activeFontLabel}</span>
        }
        panelClassName="w-44"
      >
        {(close) => (
          <div className="space-y-0.5">
            {DOCS_FONT_FAMILIES.map((font) => (
              <button
                key={font.label}
                type="button"
                style={{ fontFamily: font.value }}
                onMouseDown={prevent}
                onClick={() => {
                  onFontFamily(font.value)
                  close()
                }}
                className="flex w-full rounded-xs px-2 py-1.5 text-left text-[12.5px] text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]"
              >
                {font.label}
              </button>
            ))}
          </div>
        )}
      </ToolbarDropdown>

      <FontSizeControl
        value={format.fontSize}
        min={8}
        max={72}
        disabled={disabled}
        onChange={onFontSize}
      />

      <ToolbarDivider />

      <ToolbarButton
        title="Bold (⌘B)"
        active={format.bold}
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('bold')}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Italic (⌘I)"
        active={format.italic}
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('italic')}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Underline (⌘U)"
        active={format.underline}
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('underline')}
      >
        <Underline className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        active={format.strikethrough}
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('strikeThrough')}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ColorPalettePopover
        title="Text color"
        value={format.textColor}
        disabled={disabled}
        onChange={onTextColor}
        icon={<Type className="h-3.5 w-3.5" />}
      />
      <ColorPalettePopover
        title="Highlight color"
        value={format.highlightColor}
        disabled={disabled}
        onChange={onHighlightColor}
        clearLabel="No highlight"
        icon={<Highlighter className="h-3.5 w-3.5" />}
      />

      <ToolbarDivider />

      <ToolbarButton
        title="Insert link (⌘K)"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={onInsertLink}
      >
        <Link2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Add comment (⌘⌥M)"
        onMouseDown={prevent}
        onClick={onAddComment}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Insert image"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={onInsertImage}
      >
        <Image className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarDropdown
        title="Insert table"
        disabled={disabled}
        trigger={<Table2 className="h-3.5 w-3.5" />}
      >
        {(close) => (
          <TableGridPicker
            onSelect={(r, c) => {
              onInsertTable(r, c)
              close()
            }}
          />
        )}
      </ToolbarDropdown>
      <ToolbarButton
        title="Insert callout"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={onInsertCallout}
      >
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarDivider />

      <ToolbarDropdown
        title="Align"
        disabled={disabled}
        panelClassName="w-36"
        trigger={
          format.align === 'center' ? (
            <AlignCenter className="h-3.5 w-3.5" />
          ) : format.align === 'right' ? (
            <AlignRight className="h-3.5 w-3.5" />
          ) : format.align === 'justify' ? (
            <AlignJustify className="h-3.5 w-3.5" />
          ) : (
            <AlignLeft className="h-3.5 w-3.5" />
          )
        }
      >
        {(close) => (
          <div className="space-y-0.5">
            {(
              [
                {
                  cmd: 'justifyLeft',
                  label: 'Left align',
                  icon: <AlignLeft className="h-3.5 w-3.5" />,
                },
                {
                  cmd: 'justifyCenter',
                  label: 'Center align',
                  icon: <AlignCenter className="h-3.5 w-3.5" />,
                },
                {
                  cmd: 'justifyRight',
                  label: 'Right align',
                  icon: <AlignRight className="h-3.5 w-3.5" />,
                },
                {
                  cmd: 'justifyFull',
                  label: 'Justify',
                  icon: <AlignJustify className="h-3.5 w-3.5" />,
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.cmd}
                type="button"
                onMouseDown={prevent}
                onClick={() => {
                  onInlineCommand(opt.cmd)
                  close()
                }}
                className="flex w-full items-center gap-2 rounded-xs px-2 py-1 text-left text-[12px] hover:bg-[var(--xd-surface-hover)]"
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </ToolbarDropdown>

      <ToolbarDropdown
        title="Line spacing"
        disabled={disabled}
        panelClassName="w-32"
        trigger={<span className="xd-tabular text-[11px]">{lineSpacing}×</span>}
      >
        {(close) => (
          <div className="space-y-0.5">
            {[
              { label: 'Single (1.15)', val: 1.15 },
              { label: 'Default (1.55)', val: 1.55 },
              { label: 'Relaxed (1.75)', val: 1.75 },
              { label: 'Double (2.0)', val: 2.0 },
            ].map((item) => (
              <button
                key={item.val}
                type="button"
                onMouseDown={prevent}
                onClick={() => {
                  onLineSpacing(item.val)
                  close()
                }}
                className={cn(
                  'xd-tabular flex w-full rounded-xs px-2 py-1 text-left text-[12px] hover:bg-[var(--xd-surface-hover)]',
                  lineSpacing === item.val &&
                    'bg-[var(--xd-accent-soft)] font-medium text-[var(--xd-accent)]',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </ToolbarDropdown>

      <ToolbarDivider />

      <ToolbarButton
        title="Checklist"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={onInsertChecklist}
      >
        <CheckSquare className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Bulleted list"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('insertUnorderedList')}
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('insertOrderedList')}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Decrease indent"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('outdent')}
      >
        <IndentDecrease className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Increase indent"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('indent')}
      >
        <IndentIncrease className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Clear formatting"
        disabled={disabled}
        onMouseDown={prevent}
        onClick={() => onInlineCommand('removeFormat')}
      >
        <RemoveFormatting className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  )
}
