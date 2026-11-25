import type { StorybookConfig } from '@storybook/tanstack-react'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-mcp',
  ],
  framework: '@storybook/tanstack-react',
  async viteFinal(config, options) {
    // The dev server and Vitest project stay at `/`. Production output is
    // hosted by the app at `/design/`, so preview assets must use that base.
    if (options?.configType === 'PRODUCTION') {
      config.base = '/design/'
    }
    return config
  },
}

export default config
