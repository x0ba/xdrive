import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  DesignTokensShowcase,
  MarbleSyncBadge,
  MarbleOpBadge,
} from '#/components/design-system'

const meta = {
  title: 'xDrive Design System/Design Tokens & Marble Op Badges',
  component: DesignTokensShowcase,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DesignTokensShowcase>

export default meta
type Story = StoryObj<typeof meta>

export const ObsidianStudioDark: Story = {
  args: {
    initialTheme: 'dark',
  },
}

export const AlabasterLabLight: Story = {
  args: {
    initialTheme: 'light',
  },
}

export const SemanticOpAndSyncStrip: StoryObj = {
  render: () => (
    <div className="space-y-6 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--xd-ink)]">
          Live .mrbl Sync States
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <MarbleSyncBadge state="saved" />
          <MarbleSyncBadge state="saving" />
          <MarbleSyncBadge state="proposed" />
          <MarbleSyncBadge state="retrying" />
          <MarbleSyncBadge state="offline" />
        </div>
      </div>

      <div>
        <h3 className="text-[13px] font-semibold text-[var(--xd-ink)]">
          Atomic Marble DOM Mutation Badges
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <MarbleOpBadge
            opType="setText"
            targetId="thm-logical-threshold"
            summary='"d=11 logical error rate 2.4e-7 per round"'
          />
          <MarbleOpBadge
            opType="setInner"
            targetId="eq-surface-hamiltonian"
            summary="<math>H = -\sum A_v - \sum B_p</math>"
          />
          <MarbleOpBadge
            opType="setAttr"
            targetId="fig-circuit-lattice"
            summary='data-noise-bias="100"'
          />
          <MarbleOpBadge
            opType="insert"
            targetId="row-gpt54-scaling"
            summary="into #tbl-chinchilla-frontier"
          />
          <MarbleOpBadge
            opType="move"
            targetId="slide-tps-tile-stress"
            summary="before #slide-plasma-reentry"
          />
          <MarbleOpBadge
            opType="remove"
            targetId="cell-deprecated-probe"
            summary="pruned obsolete notebook block"
          />
        </div>
      </div>
    </div>
  ),
}
