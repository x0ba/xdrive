import type { AIProviderId } from '#/lib/types'
import { cn } from '#/lib/utils'

/**
 * Adapted from t3code (`apps/web/src/components/chat/EffortGlyph.tsx` and
 * `ProviderInstanceIcon.tsx`), copyright (c) 2026 T3 Tools Inc., MIT License
 * (https://github.com/pingdotgg/t3code).
 */

/**
 * Crisp geometric provider glyphs for the T3-Code-style two-pane model picker rail
 * and trigger button.
 */
export function ProviderGlyph({
  providerId,
  className = 'size-4',
}: {
  providerId: AIProviderId
  className?: string
}) {
  switch (providerId) {
    case 'antigravity':
      // Four-point star / Gemini spark
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn('shrink-0', className)}
        >
          <path
            d="M8 1.5C8.55 5.15 10.85 7.45 14.5 8C10.85 8.55 8.55 10.85 8 14.5C7.45 10.85 5.15 8.55 1.5 8C5.15 7.45 7.45 5.15 8 1.5Z"
            fill="currentColor"
          />
        </svg>
      )
    case 'opencode-go':
      // Framed terminal chevron mark
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn('shrink-0', className)}
        >
          <rect
            x="2"
            y="2.5"
            width="12"
            height="11"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M5.2 6.2L7.4 8L5.2 9.8M8.6 9.8H11"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'claude':
      // 8-ray starburst mark
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn('shrink-0', className)}
        >
          <path
            d="M8 1.75V14.25M1.75 8H14.25M3.6 3.6L12.4 12.4M12.4 3.6L3.6 12.4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'openai':
      // Interlocked geometric ring mark
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn('shrink-0', className)}
        >
          <circle
            cx="8"
            cy="8"
            r="5.6"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M8 2.4V8L12.8 10.8M8 8L3.2 10.8"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'grok-build':
      // Orbital slash mark for SpaceXSI Grok Build CLI
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn('shrink-0', className)}
        >
          <path
            d="M12.3 5.2A5.3 5.3 0 1 0 13.1 9.4"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <path
            d="M3.2 12.8L13.2 2.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'xai':
    default:
      // Diagonal xAI slash mark
      return (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={cn('shrink-0', className)}
        >
          <path
            d="M3 13L13 3M3.5 3.5L7.5 7.5M8.5 8.5L12.5 12.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )
  }
}

/**
 * Pixel-sharp rising effort bars on whole pixels, aligned to the text baseline.
 */
export function EffortGlyph({
  count = 4,
  filled,
  size = 'sm',
  className,
}: {
  count?: number
  filled: number
  size?: 'sm' | 'xs'
  className?: string
}) {
  const height = size === 'xs' ? 12 : 14
  const baselineInset = 2
  const step = 4
  const width = step * count - 2
  const maxBar = height - baselineInset
  const barStep = Math.max(1, Math.round(maxBar / 2 / Math.max(count - 1, 1)))
  const heights = Array.from(
    { length: count },
    (_, index) => maxBar - (count - 1 - index) * barStep,
  )

  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width, height }}
      className={cn('shrink-0 text-current', className)}
    >
      {heights.map((barHeight, index) => {
        const x = index * step
        return (
          <rect
            key={x}
            x={x}
            y={maxBar - barHeight}
            width={2}
            height={barHeight}
            rx={0.5}
            fill="currentColor"
            opacity={index < filled ? 1 : 0.34}
          />
        )
      })}
    </svg>
  )
}
