import { createFileRoute } from '@tanstack/react-router'
import { XDriveWorkspace } from '#/components/workspace'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return <XDriveWorkspace />
}
