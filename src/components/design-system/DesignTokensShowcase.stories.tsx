import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  DesignTokensShowcase,
  MarbleOpBadge,
  MarbleSyncBadge,
} from './DesignTokensShowcase'

/**
 * xDrive color system, typography scale, spacing tokens, and Marble status/operation badges.
 *
 * @summary Design tokens showcase with Obsidian Studio dark and Alabaster Lab light themes
 */
const meta = {
  title: 'xDrive Design System/Design Tokens',
  component: DesignTokensShowcase,
  subcomponents: {
    MarbleSyncBadge,
    MarbleOpBadge,
  },
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DesignTokensShowcase>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Obsidian Studio dark theme token palette and typography showcase.
 *
 * @summary Dark theme design tokens
 */
export const DarkTheme: Story = {
  args: {
    initialTheme: 'dark',
  },
}

/**
 * Alabaster Lab light theme token palette and typography showcase.
 *
 * @summary Light theme design tokens
 */
export const LightTheme: Story = {
  args: {
    initialTheme: 'light',
  },
}

/**
 * Sync status badges (`saved`, `saving`, `proposed`, `retrying`, `offline`) and semantic Marble op badges.
 *
 * @summary Marble sync and operation badges
 */
export const Badges: Story = {
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
