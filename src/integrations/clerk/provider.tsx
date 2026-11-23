import { ClerkProvider } from '@clerk/tanstack-react-start'
import { isClerkEnabled } from './config'

export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isClerkEnabled()) {
    return <>{children}</>
  }

  return <ClerkProvider>{children}</ClerkProvider>
}
