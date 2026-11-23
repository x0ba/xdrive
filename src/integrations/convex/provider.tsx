import { ConvexProvider } from 'convex/react'
import { ConvexQueryClient } from '@convex-dev/react-query'

const rawConvexUrl = (import.meta as { env?: Record<string, unknown> }).env
  ?.VITE_CONVEX_URL
const CONVEX_URL =
  typeof rawConvexUrl === 'string' && rawConvexUrl.trim().length > 0
    ? rawConvexUrl.trim()
    : null
const convexQueryClient = CONVEX_URL ? new ConvexQueryClient(CONVEX_URL) : null

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (!convexQueryClient) {
    return <>{children}</>
  }

  return (
    <ConvexProvider client={convexQueryClient.convexClient}>
      {children}
    </ConvexProvider>
  )
}
