import {
  Bold,
  CheckSquare,
  Code,
  CodeSquare,
  Columns2,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  PenLine,
  Quote,
  Strikethrough,
  Table2,
  Type,
  Underline,
} from 'lucide-react'
import {
  ToolbarButton,
  ToolbarDivider,
  ToolbarDropdown,
} from '#/components/apps/shared'
import { cn } from '#/lib/utils'
import type { NotesViewMode } from './types'

export type MarkdownFormatCommand =
  | 'title'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'inlineCode'
  | 'checklist'
  | 'bullet'
  | 'numbered'
  | 'quote'
  | 'codeBlock'
  | 'hr'
  | 'table'
  | 'link'

export interface NotesFormattingBarProps {
  viewMode: NotesViewMode
  disabled?: boolean
  onChangeViewMode: (mode: NotesViewMode) => void
  onFormat: (cmd: MarkdownFormatCommand) => void
}

export function NotesFormattingBar({
  viewMode,
  disabled = false,
  onChangeViewMode,
  onFormat,
}: NotesFormattingBarProps) {
  const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div
      role="toolbar"
      aria-label="Note formatting"
      className="flex h-10 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-[var(--xd-border)] bg-[var(--xd-canvas)] px-3 select-none"
    >
      <div className="flex items-center gap-0.5">
        <ToolbarDropdown
          title="Text style"
          disabled={disabled}
          panelClassName="w-40"
          trigger={
            <span className="inline-flex items-center gap-1 text-[12px] font-medium">
              <Type className="h-3.5 w-3.5" />
              <span>Aa</span>
            </span>
          }
        >
          {(close) => (
            <div className="space-y-0.5">
              {(
                [
                  {
                    id: 'title',
                    label: 'Title',
                    sample: 'text-[15px] font-semibold',
                  },
                  {
                    id: 'h2',
                    label: 'Heading',
                    sample: 'text-[13.5px] font-semibold',
                  },
                  {
                    id: 'h3',
                    label: 'Subheading',
                    sample: 'text-[12.5px] font-medium',
                  },
                  { id: 'body', label: 'Body', sample: 'text-[12px]' },
                  {
                    id: 'codeBlock',
                    label: 'Monostyled',
                    sample: 'xd-mono text-[11.5px]',
                  },
                ] as const
              ).map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onMouseDown={preventFocusLoss}
                  onClick={() => {
                    onFormat(style.id)
                    close()
                  }}
                  className={cn(
                    'flex w-full items-center rounded-xs px-2 py-1 text-left text-[var(--xd-ink)] hover:bg-[var(--xd-surface-hover)]',
                    style.sample,
                  )}
                >
                  {style.label}
                </button>
              ))}
            </div>
          )}
        </ToolbarDropdown>

        <ToolbarDivider />

        <ToolbarButton
          title="Bold (⌘B)"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('bold')}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic (⌘I)"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('italic')}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline (⌘U)"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('underline')}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('strike')}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Inline code (⌘E)"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('inlineCode')}
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Heading 1"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('title')}
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('h2')}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('h3')}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Checklist"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('checklist')}
        >
          <CheckSquare className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Bulleted list"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('bullet')}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('numbered')}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          title="Blockquote"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('quote')}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Code block"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('codeBlock')}
        >
          <CodeSquare className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Table"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('table')}
        >
          <Table2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Insert link (⌘K)"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('link')}
        >
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Divider"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => onFormat('hr')}
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* Markdown view mode switch */}
      <div
        role="group"
        aria-label="Markdown display mode"
        className="inline-flex shrink-0 items-center rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] p-0.5 text-[11px]"
      >
        {(
          [
            {
              id: 'write',
              label: 'Write',
              icon: <PenLine className="h-3 w-3" />,
            },
            {
              id: 'split',
              label: 'Split',
              icon: <Columns2 className="h-3 w-3" />,
            },
            {
              id: 'preview',
              label: 'Preview',
              icon: <Eye className="h-3 w-3" />,
            },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={viewMode === item.id}
            onClick={() => onChangeViewMode(item.id)}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-xs px-2 font-medium transition-colors',
              viewMode === item.id
                ? 'bg-[var(--xd-canvas)] text-[var(--xd-ink)] shadow-2xs'
                : 'text-[var(--xd-ink-secondary)] hover:text-[var(--xd-ink)]',
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
