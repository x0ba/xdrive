const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

function isTruthyFlag(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return TRUE_VALUES.has(value.trim().toLowerCase())
}

/**
 * Clerk authentication is opt-in (disabled by default for personal/tailnet deployments).
 * Set `VITE_ENABLE_CLERK=true` along with `VITE_CLERK_PUBLISHABLE_KEY` (build + runtime)
 * and `CLERK_SECRET_KEY` (runtime) to enable Clerk.
 */
export function isClerkEnabled(): boolean {
  if (!isTruthyFlag(import.meta.env.VITE_ENABLE_CLERK)) {
    return false
  }
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  return typeof publishableKey === 'string' && publishableKey.trim().length > 0
}
