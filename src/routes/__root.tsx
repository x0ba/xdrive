import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import ClerkProvider from '../integrations/clerk/provider'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'xDrive · AI-Native Marble (.mrbl) Research Cloud',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  notFoundComponent: RootNotFound,
  shellComponent: RootDocument,
})

function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b0c0e] px-6 text-center text-[#f3f5f8]">
      <p className="xd-mono text-[11px] uppercase tracking-wider text-[#6e7785]">
        404 · Not Found
      </p>
      <h1 className="mt-2 text-[20px] font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="mt-1.5 max-w-sm text-[13px] text-[#a2abb8]">
        The xDrive URL you requested could not be matched.
      </p>
      <Link
        to="/drive"
        className="mt-5 inline-flex h-8 items-center rounded-md bg-[#5e6ad2] px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[#6e7ae2]"
      >
        Back to My Drive
      </Link>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider>
          {children}
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}
