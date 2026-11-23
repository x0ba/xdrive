import { Show, SignInButton, UserButton } from '@clerk/tanstack-react-start'
import { isClerkEnabled } from './config'

export default function HeaderUser() {
  if (!isClerkEnabled()) {
    return null
  }

  return (
    <>
      <Show when="signed-in">
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInButton />
      </Show>
    </>
  )
}
