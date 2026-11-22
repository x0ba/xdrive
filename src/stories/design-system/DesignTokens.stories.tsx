import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  DesignTokensShowcase,
  MarbleSyncBadge,
  MarbleOpBadge,
} from '#/components/design-system'

const meta = {
  title: 'xDrive Design System/Design Tokens',
  component: DesignTokensShowcase,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DesignTokensShowcase>

export default meta
type Story = StoryObj<typeof meta>

export const DarkTheme: Story = {
  args: {
    initialTheme: 'dark',
  },
}

export const LightTheme: Story = {
  args: {
    initialTheme: 'light',
  },
}

export const Badges: StoryObj = {
  render: () => (
    <div className="space-y-4 bg-[var(--xd-canvas)] p-6 text-[var(--xd-ink)]">
      <div className="flex flex-wrap gap-2">
        <MarbleSyncBadge state="saved" />
        <MarbleSyncBadge state="saving" />
        <MarbleSyncBadge state="proposed" />
        <MarbleSyncBadge state="retrying" />
        <MarbleSyncBadge state="offline" />
      </div>

      <div className="flex flex-wrap gap-2">
        <MarbleOpBadge
          opType="setText"
          targetId="thm-logical-threshold"
          summary='"p_th = 1.04%"'
        />
        <MarbleOpBadge
          opType="insert"
          targetId="row-gpt54-scaling"
          summary="into #tbl-frontier"
        />
        <MarbleOpBadge
          opType="remove"
          targetId="cell-deprecated-probe"
          summary="removed"
        />
      </div>
    </div>
  ),
}
