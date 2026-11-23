import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, within } from 'storybook/test'
import { seedDriveFolders } from './DriveExplorer'
import { SidebarRail } from './NavigationShell'
import type { PrimaryNavId } from './NavigationShell'
import { NewAppButton, NewAppModal } from './NewAppCreator'
import type { NewAppMode } from './NewAppCreator'
import {
  INITIAL_WORKSPACE_DOCS,
  PREDEFINED_MARBLE_TEMPLATES,
} from '#/lib/marble'

function TopLeftNewButtonMenuDemo() {
  const [activeNav, setActiveNav] = useState<PrimaryNavId>('drive')
  const [lastAction, setLastAction] = useState('Click "+ New" at the top left')
  const { folders } = seedDriveFolders(INITIAL_WORKSPACE_DOCS)

  return (
    <div className="flex h-[560px] bg-[var(--xd-canvas)] text-[var(--xd-ink)]">
      <SidebarRail
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        folders={folders}
        topAction={
          <NewAppButton
            defaultOpen
            templates={PREDEFINED_MARBLE_TEMPLATES}
            onOpenAIAgent={() => setLastAction('Opened AI Agent builder')}
            onOpenTemplates={() => setLastAction('Opened Template picker')}
            onQuickCreateTemplate={(tpl) =>
              setLastAction(`Created app from template: ${tpl.title}`)
            }
            onCreateFolder={() => setLastAction('Opened New Folder dialog')}
          />
        }
      />
      <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-[var(--xd-ink-secondary)]">
        {lastAction}
      </div>
    </div>
  )
}

function NewAppModalDemo({ initialMode }: { initialMode: NewAppMode }) {
  const { folders } = seedDriveFolders(INITIAL_WORKSPACE_DOCS)
  const [status, setStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  return (
    <div className="flex h-[640px] items-center justify-center bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <div className="space-y-3 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-[var(--xd-accent)] px-3 py-1.5 text-[12.5px] font-medium text-white"
        >
          {initialMode === 'agent'
            ? 'Reopen AI Agent modal'
            : 'Reopen Templates modal'}
        </button>
        {status && (
          <p className="text-[12px] text-[var(--xd-ink-secondary)]">{status}</p>
        )}
      </div>
      <NewAppModal
        open={open}
        initialMode={initialMode}
        templates={PREDEFINED_MARBLE_TEMPLATES}
        folders={folders}
        onClose={() => setOpen(false)}
        onBuildWithAgent={({ prompt, modelId }) =>
          setStatus(`Building with ${modelId}: "${prompt}"`)
        }
        onCreateFromTemplate={({ template, title }) =>
          setStatus(`Created "${title}" from ${template.title}`)
        }
      />
    </div>
  )
}

function InteractiveEndToEndFlowDemo() {
  const { folders } = seedDriveFolders(INITIAL_WORKSPACE_DOCS)
  const [modalMode, setModalMode] = useState<NewAppMode | null>(null)
  const [log, setLog] = useState<string[]>([])

  return (
    <div className="flex h-[600px] bg-[var(--xd-canvas)] text-[var(--xd-ink)]">
      <SidebarRail
        activeNav="drive"
        folders={folders}
        topAction={
          <NewAppButton
            templates={PREDEFINED_MARBLE_TEMPLATES}
            onOpenAIAgent={() => setModalMode('agent')}
            onOpenTemplates={() => setModalMode('templates')}
            onQuickCreateTemplate={(tpl) =>
              setLog((prev) => [`Quick-created from ${tpl.title}`, ...prev])
            }
            onCreateFolder={() =>
              setLog((prev) => ['Triggered New folder', ...prev])
            }
          />
        }
      />
      <div className="flex flex-1 flex-col gap-3 p-6">
        <h2 className="text-[14px] font-semibold">Activity log</h2>
        {log.length === 0 ? (
          <p className="text-[12.5px] text-[var(--xd-ink-muted)]">
            Use the &ldquo;+ New&rdquo; button at the top left to build with an
            AI agent or start from a template.
          </p>
        ) : (
          <ul className="space-y-1.5 text-[12.5px] text-[var(--xd-ink-secondary)]">
            {log.map((entry, idx) => (
              <li
                key={idx}
                className="rounded border border-[var(--xd-border)] bg-[var(--xd-rail)] px-3 py-2"
              >
                {entry}
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewAppModal
        open={modalMode !== null}
        initialMode={modalMode ?? 'agent'}
        templates={PREDEFINED_MARBLE_TEMPLATES}
        folders={folders}
        onClose={() => setModalMode(null)}
        onBuildWithAgent={({ prompt, modelId }) =>
          setLog((prev) => [`AI Agent (${modelId}): ${prompt}`, ...prev])
        }
        onCreateFromTemplate={({ template, title }) =>
          setLog((prev) => [
            `Template "${template.title}" → "${title}"`,
            ...prev,
          ])
        }
      />
    </div>
  )
}

/**
 * Top-left `+ New` dropdown menu and modal creator for building `.mrbl` apps with an AI agent or from starter templates.
 *
 * @summary New app creation button dropdown and AI/template creator modal
 */
const meta = {
  title: 'xDrive Design System/New App Creator',
  component: NewAppButton,
  subcomponents: {
    NewAppModal,
  },
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NewAppButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Top-left `+ New` button expanded inside the navigation rail with quick template shortcuts.
 *
 * @summary Top-left New button with open dropdown menu
 */
export const TopLeftNewButtonMenu: Story = {
  name: 'Top-Left New Button & Dropdown',
  render: () => <TopLeftNewButtonMenuDemo />,
  play: async ({ canvasElement }) => {
    const body = within(document.body)
    const menu = await body.findByRole('menu', {
      name: 'Create new app or folder',
    })
    const sidebar = canvasElement.querySelector('aside')
    await expect(sidebar).not.toBeNull()
    const menuRect = menu.getBoundingClientRect()
    const sidebarRect = sidebar!.getBoundingClientRect()
    // Menu must render portaled outside the 208px sidebar without horizontal clipping
    await expect(menuRect.width).toBeGreaterThanOrEqual(280)
    await expect(menuRect.right).toBeGreaterThan(sidebarRect.right)
    await expect(sidebar!.contains(menu)).toBe(false)
  },
}

/**
 * New App modal opened directly to the Build with AI Agent flow.
 *
 * @summary Build with AI Agent creation modal
 */
export const CreateWithAIAgentModal: Story = {
  name: 'Modal · Build with AI Agent',
  render: () => <NewAppModalDemo initialMode="agent" />,
}

/**
 * New App modal opened directly to the template gallery picker.
 *
 * @summary New from Template creation modal
 */
export const CreateFromTemplateModal: Story = {
  name: 'Modal · New from Template',
  render: () => <NewAppModalDemo initialMode="templates" />,
}

/**
 * End-to-end interactive flow connecting the `+ New` sidebar menu to the modal creator and activity log.
 *
 * @summary Interactive end-to-end app creation flow
 */
export const InteractiveEndToEndFlow: Story = {
  name: 'Interactive End-to-End Flow',
  render: () => <InteractiveEndToEndFlowDemo />,
}
