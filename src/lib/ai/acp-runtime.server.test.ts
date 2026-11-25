import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AcpError,
  DEFAULT_ACP_PROMPT_IDLE_TIMEOUT_MS,
  DEFAULT_ACP_PROMPT_MAX_DURATION_MS,
  createPromptTimeoutController,
  formatTimeoutDuration,
  isAcpClientAbortError,
  logAcpServerError,
  mapAcpPromptError,
  resolvePromptTimeoutConfig,
} from './acp-runtime.server'
import {
  DEFAULT_COLLABORATE_CLIENT_TIMEOUT_MS,
  MarbleCollaborationError,
  toMarbleCollaborationError,
} from '#/lib/marble/ai-collaborator'

describe('ACP prompt timeout watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts with idle_timeout when no session updates arrive', () => {
    const watchdog = createPromptTimeoutController({
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
    })

    vi.advanceTimersByTime(89_999)
    expect(watchdog.signal.aborted).toBe(false)
    expect(watchdog.getAbortReason()).toBeNull()

    vi.advanceTimersByTime(1)
    expect(watchdog.signal.aborted).toBe(true)
    expect(watchdog.getAbortReason()).toBe('idle_timeout')
    watchdog.cleanup()
  })

  it('resets the idle timer on every touch() so long reasoning runs survive past 180s', () => {
    const watchdog = createPromptTimeoutController({
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
    })

    // Simulate thought chunks arriving every 60s for 300s (well past old 180s wall-clock cap).
    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(60_000)
      expect(watchdog.signal.aborted).toBe(false)
      watchdog.touch()
    }

    expect(watchdog.signal.aborted).toBe(false)
    expect(watchdog.getAbortReason()).toBeNull()

    // Stop streaming -> idle timeout triggers 90s after last touch.
    vi.advanceTimersByTime(90_000)
    expect(watchdog.signal.aborted).toBe(true)
    expect(watchdog.getAbortReason()).toBe('idle_timeout')
    watchdog.cleanup()
  })

  it('enforces the hard maxDurationMs cap even when chunks keep arriving', () => {
    const watchdog = createPromptTimeoutController({
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
    })

    // Stream chunks every 30s for 19 steps (570s elapsed) -> still alive.
    for (let i = 0; i < 19; i += 1) {
      vi.advanceTimersByTime(30_000)
      expect(watchdog.signal.aborted).toBe(false)
      watchdog.touch()
    }

    // 30s later (600s total) -> hard cap fires even though idle timer had 60s left.
    vi.advanceTimersByTime(30_000)
    expect(watchdog.signal.aborted).toBe(true)
    expect(watchdog.getAbortReason()).toBe('max_duration')
    watchdog.cleanup()
  })

  it('distinguishes client disconnect aborts from timeouts', () => {
    const clientController = new AbortController()
    const watchdog = createPromptTimeoutController({
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
      clientSignal: clientController.signal,
    })

    vi.advanceTimersByTime(10_000)
    clientController.abort()

    expect(watchdog.signal.aborted).toBe(true)
    expect(watchdog.getAbortReason()).toBe('client_abort')

    // Advancing past idle/max timers must not overwrite client_abort.
    vi.advanceTimersByTime(700_000)
    expect(watchdog.getAbortReason()).toBe('client_abort')
    watchdog.cleanup()
  })

  it('handles an already-aborted clientSignal immediately', () => {
    const clientController = new AbortController()
    clientController.abort()

    const watchdog = createPromptTimeoutController({
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
      clientSignal: clientController.signal,
    })

    expect(watchdog.signal.aborted).toBe(true)
    expect(watchdog.getAbortReason()).toBe('client_abort')
    watchdog.cleanup()
  })

  it('cancels all pending timers on cleanup()', () => {
    const watchdog = createPromptTimeoutController({
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
    })

    watchdog.cleanup()
    vi.advanceTimersByTime(700_000)
    expect(watchdog.signal.aborted).toBe(false)
    expect(watchdog.getAbortReason()).toBeNull()
  })
})

describe('resolvePromptTimeoutConfig & formatTimeoutDuration', () => {
  it('uses shared defaults when no overrides are given', () => {
    const resolved = resolvePromptTimeoutConfig({ env: {} })
    expect(resolved).toEqual({
      idleTimeoutMs: DEFAULT_ACP_PROMPT_IDLE_TIMEOUT_MS,
      maxDurationMs: DEFAULT_ACP_PROMPT_MAX_DURATION_MS,
    })
    expect(DEFAULT_COLLABORATE_CLIENT_TIMEOUT_MS).toBeGreaterThan(
      DEFAULT_ACP_PROMPT_MAX_DURATION_MS,
    )
  })

  it('applies precedence: per-input > env > options > defaults', () => {
    expect(
      resolvePromptTimeoutConfig({
        optionIdleTimeoutMs: 45_000,
        optionMaxDurationMs: 300_000,
        env: {
          XDRIVE_ACP_IDLE_TIMEOUT_MS: '15000',
          XDRIVE_ACP_MAX_DURATION_MS: '120000',
        },
      }),
    ).toEqual({
      idleTimeoutMs: 15_000,
      maxDurationMs: 120_000,
    })

    expect(
      resolvePromptTimeoutConfig({
        inputIdleTimeoutMs: 2_500,
        inputMaxDurationMs: 10_000,
        optionIdleTimeoutMs: 45_000,
        env: {
          XDRIVE_ACP_IDLE_TIMEOUT_MS: '15000',
        },
      }),
    ).toEqual({
      idleTimeoutMs: 2_500,
      maxDurationMs: 10_000,
    })
  })

  it('ignores non-positive or non-numeric overrides', () => {
    expect(
      resolvePromptTimeoutConfig({
        inputIdleTimeoutMs: 0,
        inputMaxDurationMs: -50,
        env: {
          XDRIVE_ACP_IDLE_TIMEOUT_MS: 'invalid',
          XDRIVE_ACP_MAX_DURATION_MS: '-1',
        },
      }),
    ).toEqual({
      idleTimeoutMs: DEFAULT_ACP_PROMPT_IDLE_TIMEOUT_MS,
      maxDurationMs: DEFAULT_ACP_PROMPT_MAX_DURATION_MS,
    })
  })

  it('formats durations cleanly', () => {
    expect(formatTimeoutDuration(90_000)).toBe('90s')
    expect(formatTimeoutDuration(600_000)).toBe('600s')
    expect(formatTimeoutDuration(1_500)).toBe('1.5s')
    expect(formatTimeoutDuration(500)).toBe('0.5s')
  })
})

describe('mapAcpPromptError & error mapping', () => {
  const makeError = (
    code:
      | 'BINARY_MISSING'
      | 'AUTH_REQUIRED'
      | 'ACP_ERROR'
      | 'TIMEOUT'
      | 'INSTALL_FAILED',
    message: string,
    httpStatus = 500,
  ) => new AcpError(code, message, httpStatus)

  it('maps idle_timeout to TIMEOUT 504 with clear provider message even when SDK throws Request cancelled', () => {
    const sdkCancelErr = Object.assign(new Error('Request cancelled'), {
      code: -32800,
      data: new DOMException('ACP prompt idle timeout', 'TimeoutError'),
    })

    const mapped = mapAcpPromptError({
      error: sdkCancelErr,
      providerLabel: 'OpenCode',
      abortReason: 'idle_timeout',
      clientAborted: false,
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
      authRequiredMessage: 'Sign in required',
      makeError,
    })

    expect(mapped).toBeInstanceOf(AcpError)
    const acpErr = mapped as AcpError
    expect(acpErr.code).toBe('TIMEOUT')
    expect(acpErr.httpStatus).toBe(504)
    expect(acpErr.message).toBe(
      'OpenCode timed out after 90s with no response.',
    )
  })

  it('maps max_duration to TIMEOUT 504 with exceeded Ns message', () => {
    const mapped = mapAcpPromptError({
      error: new Error('Request cancelled'),
      providerLabel: 'Antigravity',
      abortReason: 'max_duration',
      clientAborted: false,
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
      authRequiredMessage: 'Sign in required',
      makeError,
    })

    expect(mapped).toBeInstanceOf(AcpError)
    const acpErr = mapped as AcpError
    expect(acpErr.code).toBe('TIMEOUT')
    expect(acpErr.httpStatus).toBe(504)
    expect(acpErr.message).toBe('Antigravity timed out (exceeded 600s).')
  })

  it('keeps real client aborts as a quiet AbortError instead of ACP_ERROR or TIMEOUT', () => {
    const mapped = mapAcpPromptError({
      error: Object.assign(new Error('Request cancelled'), { code: -32800 }),
      providerLabel: 'OpenCode',
      abortReason: 'client_abort',
      clientAborted: true,
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
      authRequiredMessage: 'Sign in required',
      makeError,
    })

    expect(mapped).not.toBeInstanceOf(AcpError)
    expect(isAcpClientAbortError(mapped)).toBe(true)
  })

  it('maps auth required errors to AUTH_REQUIRED 401', () => {
    const authErr = Object.assign(new Error('Authentication required'), {
      code: -32000,
    })

    const mapped = mapAcpPromptError({
      error: authErr,
      providerLabel: 'Antigravity',
      abortReason: null,
      clientAborted: false,
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
      authRequiredMessage: 'Please sign in.',
      makeError,
    })

    expect(mapped).toBeInstanceOf(AcpError)
    expect((mapped as AcpError).code).toBe('AUTH_REQUIRED')
    expect((mapped as AcpError).httpStatus).toBe(401)
    expect(mapped.message).toBe('Please sign in.')
  })

  it('maps unrecognized SDK errors to ACP_ERROR 502', () => {
    const mapped = mapAcpPromptError({
      error: new Error('Upstream protocol error'),
      providerLabel: 'OpenCode',
      abortReason: null,
      clientAborted: false,
      idleTimeoutMs: 90_000,
      maxDurationMs: 600_000,
      authRequiredMessage: 'Please sign in.',
      makeError,
    })

    expect(mapped).toBeInstanceOf(AcpError)
    expect((mapped as AcpError).code).toBe('ACP_ERROR')
    expect((mapped as AcpError).httpStatus).toBe(502)
    expect(mapped.message).toBe('Upstream protocol error')
  })

  it('logs ACP errors/timeouts server-side but stays silent on client aborts', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      logAcpServerError({
        route: '/api/ai',
        action: 'collaborate',
        providerId: 'opencode-go',
        modelId: 'opencode-go/glm-5.3',
        elapsedMs: 90_120,
        error: new AcpError(
          'TIMEOUT',
          'OpenCode timed out after 90s with no response.',
          504,
        ),
      })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(
        '[/api/ai] AI request failed',
        expect.objectContaining({
          providerId: 'opencode-go',
          modelId: 'opencode-go/glm-5.3',
          code: 'TIMEOUT',
          httpStatus: 504,
        }),
      )

      spy.mockClear()
      const abortErr = new Error('Request cancelled by client')
      abortErr.name = 'AbortError'
      logAcpServerError({
        route: '/api/ai',
        action: 'collaborate',
        providerId: 'opencode-go',
        clientAborted: true,
        error: abortErr,
      })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('maps client collaborate error payloads including TIMEOUT 504', () => {
    const timeoutErr = toMarbleCollaborationError({
      code: 'TIMEOUT',
      httpStatus: 504,
      error: 'OpenCode timed out after 90s with no response.',
    })
    expect(timeoutErr).toBeInstanceOf(MarbleCollaborationError)
    expect(timeoutErr.code).toBe('TIMEOUT')
    expect(timeoutErr.message).toBe(
      'OpenCode timed out after 90s with no response.',
    )

    const fallback504 = toMarbleCollaborationError({}, 504)
    expect(fallback504.code).toBe('TIMEOUT')
    expect(fallback504.message).toContain('HTTP 504')

    const authErr = toMarbleCollaborationError({
      code: 'AUTH_REQUIRED',
      authRequired: true,
      error: 'Sign in',
    })
    expect(authErr.code).toBe('AUTH_REQUIRED')
  })
})
