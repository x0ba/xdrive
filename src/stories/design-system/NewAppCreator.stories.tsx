import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  NewAppButton,
  NewAppModal,
  SidebarRail,
  seedDriveFolders,
} from '#/components/design-system'
import type { NewAppMode, PrimaryNavId } from '#/components/design-system'
import { INITIAL_WORKSPACE_DOCS, PREDEFINED_MARBLE_TEMPLATES } from '#/lib/marble'

const meta = {
  title: 'xDrive Design System/New App Creator',
  component: NewAppButton,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NewAppButton>

export default meta

export const TopLeftNewButtonMenu: StoryObj = {
  name: 'Top-Left New Button & Dropdown',
  render: () => {
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
  },
}

export const CreateWithAIAgentModal: StoryObj = {
  name: 'Modal · Build with AI Agent',
  render: () => {
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
            Reopen AI Agent modal
          </button>
          {status && (
            <p className="text-[12px] text-[var(--xd-ink-secondary)]">
              {status}
            </p>
          )}
        </div>
        <NewAppModal
          open={open}
          initialMode="agent"
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
  },
}

export const CreateFromTemplateModal: StoryObj = {
  name: 'Modal · New from Template',
  render: () => {
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
            Reopen Templates modal
          </button>
          {status && (
            <p className="text-[12px] text-[var(--xd-ink-secondary)]">
              {status}
            </p>
          )}
        </div>
        <NewAppModal
          open={open}
          initialMode="templates"
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
  },
}

export const InteractiveEndToEndFlow: StoryObj = {
  name: 'Interactive End-to-End Flow',
  render: () => {
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
              Use the "+ New" button at the top left to build with an AI agent
              or start from a template.
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
  },
}
