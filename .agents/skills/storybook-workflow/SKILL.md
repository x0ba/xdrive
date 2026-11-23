---
name: storybook-workflow
description: Standards and workflows for building, mocking, and testing UI components and routes with Storybook (@storybook/tanstack-react) in a TanStack Start codebase. Use whenever creating or modifying UI components, route components, or *.stories.* files.
---

# Storybook + TanStack Start Agent Guidelines

## 1. Framework & Imports
- **Framework:** This repo uses `@storybook/tanstack-react`. Always import `Meta` and `StoryObj` from `@storybook/tanstack-react` (never `@storybook/react` or `@storybook/react-vite`).
- **CSF 3 + Strict Types:** Co-locate `ComponentName.stories.tsx` beside `ComponentName.tsx`. Use `satisfies Meta<typeof Component>` and `type Story = StoryObj<typeof meta>`.
- **Reuse first:** Before creating new UI, inspect existing stories (or query the Storybook MCP server if connected) to reuse design system primitives.

## 2. Routing & Loaders (No Manual Router Decorators)
- **Never create manual `RouterProvider`, `createRouter`, or `createMemoryHistory` decorators**. `@storybook/tanstack-react` automatically wraps every story in an in-memory TanStack Router.
- Configure route state, search params, and loader data declaratively via `parameters.tanstack.router`:
  - Pass `route` when rendering a file-based/code-based `Route` directly.
  - Use `params` and `query` for typed path/search parameters.
  - Use `routeOverrides` to stub route loaders per story without hitting real backends.

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Route } from './$itemId';

const meta = {
  parameters: {
    layout: 'fullscreen',
    tanstack: {
      router: {
        route: Route,
        params: { itemId: '42' },
        query: { tab: 'details' },
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Standard item detail view with preloaded loader data.
 *
 * @summary Loaded item detail page
 */
export const Default: Story = {
  parameters: {
    tanstack: {
      router: {
        routeOverrides: {
          '/items/$itemId': {
            loader: async () => ({
              item: { id: '42', name: 'Deterministic Fixture' },
            }),
          },
        },
      },
    },
  },
};
