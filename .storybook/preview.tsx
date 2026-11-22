import type { Preview } from '@storybook/tanstack-react'
import '../src/styles.css'

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'xDrive Workspace Theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Obsidian Studio (Dark)', icon: 'moon' },
          { value: 'light', title: 'Alabaster Lab (Light)', icon: 'sun' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || 'dark'
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', theme === 'dark')
      }
      return (
        <div
          className={theme === 'dark' ? 'dark' : ''}
          style={{
            backgroundColor: 'var(--xd-canvas)',
            color: 'var(--xd-ink)',
            minHeight: '100%',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <Story />
        </div>
      )
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },
}

export default preview
