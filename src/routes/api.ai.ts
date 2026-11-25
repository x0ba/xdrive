import { createFileRoute } from '@tanstack/react-router'
import {
  AntigravityAcpError,
  getAntigravityAcpManager,
} from '#/lib/ai/antigravity-acp.server'
import { toXDriveAntigravityModelId } from '#/lib/ai/antigravity-types'
import {
  OpenCodeAcpError,
  getOpenCodeStatus,
  runOpenCodePrompt,
} from '#/lib/ai/opencode-acp.server'
import { OpenCodeGoError } from '#/lib/ai/opencode-go.server'
import {
  isOpenCodeModelId,
  toXDriveOpenCodeGoModelId,
} from '#/lib/ai/opencode-go-types'
import {
  GrokBuildAcpError,
  getGrokBuildStatus,
  runGrokBuildPrompt,
} from '#/lib/ai/grok-build-acp.server'
import {
  isGrokBuildModelId,
  toXDriveGrokBuildModelId,
} from '#/lib/ai/grok-build-types'
import {
  buildMarbleAcpPrompt,
  parseMarbleAcpResponse,
} from '#/lib/ai/marble-prompt.server'
import type { ServerCollaborateInput } from '#/lib/ai/marble-prompt.server'

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function errorResponse(error: unknown) {
  if (error instanceof AntigravityAcpError) {
    return json(
      {
        ok: false,
        providerId: 'antigravity',
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        binaryMissing: error.code === 'BINARY_MISSING',
        error: error.message,
      },
      error.httpStatus,
    )
  }
  if (error instanceof OpenCodeAcpError) {
    return json(
      {
        ok: false,
        providerId: 'opencode-go',
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        binaryMissing: error.code === 'BINARY_MISSING',
        error: error.message,
      },
      error.httpStatus,
    )
  }
  if (error instanceof OpenCodeGoError) {
    return json(
      {
        ok: false,
        providerId: 'opencode-go',
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        entitlementRequired: error.code === 'ENTITLEMENT_REQUIRED',
        rateLimited: error.code === 'RATE_LIMITED',
        error: error.message,
      },
      error.httpStatus,
    )
  }
  if (error instanceof GrokBuildAcpError) {
    return json(
      {
        ok: false,
        providerId: 'grok-build',
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        binaryMissing: error.code === 'BINARY_MISSING',
        error: error.message,
      },
      error.httpStatus,
    )
  }
  const message =
    error instanceof Error ? error.message : 'AI collaborator request failed'
  return json({ ok: false, code: 'AI_ERROR', error: message }, 500)
}

function resolveProviderId(body: Record<string, unknown>): string {
  if (typeof body.providerId === 'string' && body.providerId.trim()) {
    return body.providerId.trim()
  }
  if (typeof body.modelId === 'string') {
    if (isGrokBuildModelId(body.modelId)) return 'grok-build'
    if (isOpenCodeModelId(body.modelId)) return 'opencode-go'
    if (body.modelId.startsWith('antigravity/')) return 'antigravity'
  }
  return 'antigravity'
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url)
  const provider = url.searchParams.get('provider')
  const refresh = url.searchParams.get('refresh') === '1'

  try {
    if (provider === 'grok-build') {
      const status = await getGrokBuildStatus(refresh)
      return json(status)
    }
    if (provider === 'opencode-go') {
      const status = await getOpenCodeStatus(refresh)
      return json(status)
    }
    if (provider === 'antigravity') {
      const status = await getAntigravityAcpManager().getStatus()
      return json(status)
    }

    const [antigravityStatus, openCodeGoStatus, grokBuildStatus] =
      await Promise.all([
        getAntigravityAcpManager().getStatus(),
        getOpenCodeStatus(refresh),
        getGrokBuildStatus(refresh),
      ])
    return json({
      ...antigravityStatus,
      providers: {
        antigravity: antigravityStatus,
        'opencode-go': openCodeGoStatus,
        'grok-build': grokBuildStatus,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST({ request }: { request: Request }) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json(
        { ok: false, error: 'Request body must be a JSON object' },
        400,
      )
    }
    body = parsed as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'Request body must be valid JSON' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : 'collaborate'
  const providerId = resolveProviderId(body)
  const antigravity = getAntigravityAcpManager()

  try {
    if (action === 'status') {
      if (providerId === 'grok-build') {
        const status = await getGrokBuildStatus(Boolean(body.refresh))
        return json(status)
      }
      if (providerId === 'opencode-go') {
        const status = await getOpenCodeStatus(Boolean(body.refresh))
        return json(status)
      }
      const status = await antigravity.getStatus()
      return json(status)
    }

    if (action === 'install_binary') {
      const status = await antigravity.installBinary()
      return json(status)
    }

    if (action === 'authenticate') {
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined
      if (providerId === 'grok-build') {
        return json(
          {
            ok: false,
            providerId: 'grok-build',
            code: 'AUTH_REQUIRED',
            authRequired: true,
            error:
              'xDrive uses the local Grok CLI over ACP and does not accept or store xAI API keys. Run `grok login` in your terminal (or set `XAI_API_KEY` in `.env.local`), then refresh status.',
          },
          400,
        )
      }
      if (providerId === 'opencode-go') {
        return json(
          {
            ok: false,
            providerId: 'opencode-go',
            code: 'AUTH_REQUIRED',
            authRequired: true,
            error:
              'xDrive uses the local OpenCode CLI over ACP and does not accept or store OpenCode API keys. Run `opencode auth login` in your terminal (select OpenCode Go), then refresh status.',
          },
          400,
        )
      }
      const methodId =
        typeof body.methodId === 'string' && body.methodId.trim()
          ? body.methodId.trim()
          : 'oauth-personal'
      const status = await antigravity.authenticate(methodId, { apiKey })
      return json(status)
    }

    if (action === 'logout') {
      if (providerId === 'grok-build') {
        return json(
          {
            ok: false,
            providerId: 'grok-build',
            code: 'AUTH_REQUIRED',
            error:
              'Manage Grok Build credentials directly with `grok logout` in your terminal, then refresh status.',
          },
          400,
        )
      }
      if (providerId === 'opencode-go') {
        return json(
          {
            ok: false,
            providerId: 'opencode-go',
            code: 'AUTH_REQUIRED',
            error:
              'Manage OpenCode credentials directly with `opencode auth logout` in your terminal, then refresh status.',
          },
          400,
        )
      }
      const status = await antigravity.logout()
      return json(status)
    }

    if (action === 'collaborate') {
      const instruction =
        typeof body.instruction === 'string' ? body.instruction.trim() : ''
      if (!instruction) {
        return json({ ok: false, error: 'instruction is required' }, 400)
      }

      if (
        providerId !== 'antigravity' &&
        providerId !== 'opencode-go' &&
        providerId !== 'grok-build'
      ) {
        return json(
          {
            ok: false,
            code: 'PROVIDER_UNAVAILABLE',
            error: `Provider "${providerId}" is not integrated on this server. Select a Google Antigravity, OpenCode Go, or Grok Build model in Models & Providers.`,
          },
          400,
        )
      }

      const defaultModel =
        providerId === 'grok-build'
          ? 'grok-build/grok-4.7'
          : providerId === 'opencode-go'
            ? 'opencode-go/glm-5.3'
            : 'antigravity/default'

      const collaborateInput: ServerCollaborateInput = {
        source: typeof body.source === 'string' ? body.source : '',
        instruction,
        modelId:
          typeof body.modelId === 'string' && body.modelId.trim()
            ? body.modelId.trim()
            : defaultModel,
        providerId,
        action:
          typeof body.actionKind === 'string'
            ? (body.actionKind as ServerCollaborateInput['action'])
            : undefined,
        selectedElements: Array.isArray(body.selectedElements)
          ? (body.selectedElements as ServerCollaborateInput['selectedElements'])
          : undefined,
        sketchAnnotations: Array.isArray(body.sketchAnnotations)
          ? (body.sketchAnnotations as ServerCollaborateInput['sketchAnnotations'])
          : undefined,
        evergreenRefs: Array.isArray(body.evergreenRefs)
          ? (body.evergreenRefs as ServerCollaborateInput['evergreenRefs'])
          : undefined,
        designContracts: Array.isArray(body.designContracts)
          ? (body.designContracts as string[])
          : undefined,
        dontsGuardrails: Array.isArray(body.dontsGuardrails)
          ? (body.dontsGuardrails as string[])
          : undefined,
      }

      const prompt = buildMarbleAcpPrompt(collaborateInput)
      const imageDataUrls =
        typeof body.sketchDataUrl === 'string' && body.sketchDataUrl
          ? [body.sketchDataUrl]
          : undefined

      if (providerId === 'grok-build') {
        const grokResult = await runGrokBuildPrompt({
          prompt,
          modelId: collaborateInput.modelId,
          imageDataUrls,
          signal: request.signal,
        })

        const resolvedModelId = toXDriveGrokBuildModelId(grokResult.modelId)
        const parsed = parseMarbleAcpResponse(
          grokResult.text,
          collaborateInput,
          resolvedModelId,
        )

        return json({
          ok: true,
          source: 'grok-build-acp',
          proposal: parsed.proposal,
          stages: parsed.stages,
          newDocument: parsed.newDocument,
          thoughts: grokResult.thoughts,
          runtime: {
            protocol: 'acp',
            agentName: grokResult.agentName,
            agentVersion: grokResult.agentVersion,
            modelId: resolvedModelId,
            acpModelId: grokResult.modelId,
            stopReason: grokResult.stopReason,
          },
        })
      }

      if (providerId === 'opencode-go') {
        const sessionId =
          typeof body.sessionId === 'string' && body.sessionId.trim()
            ? body.sessionId.trim()
            : undefined

        const openCodeResult = await runOpenCodePrompt({
          prompt,
          modelId: collaborateInput.modelId,
          sessionId,
          imageDataUrls,
          signal: request.signal,
        })

        const resolvedModelId = toXDriveOpenCodeGoModelId(
          openCodeResult.modelId,
        )
        const parsed = parseMarbleAcpResponse(
          openCodeResult.text,
          collaborateInput,
          resolvedModelId,
        )

        return json({
          ok: true,
          source:
            openCodeResult.transport === 'acp' ? 'opencode-acp' : 'opencode-go',
          proposal: parsed.proposal,
          stages: parsed.stages,
          newDocument: parsed.newDocument,
          thoughts: openCodeResult.thoughts,
          runtime: {
            protocol: openCodeResult.protocol,
            agentName: openCodeResult.agentName,
            agentVersion: openCodeResult.agentVersion,
            modelId: resolvedModelId,
            ...(openCodeResult.acpModelId
              ? { acpModelId: openCodeResult.acpModelId }
              : {}),
            stopReason: openCodeResult.stopReason,
          },
        })
      }

      const acpResult = await antigravity.runPrompt({
        prompt,
        modelId: collaborateInput.modelId,
        imageDataUrls,
        signal: request.signal,
      })

      const resolvedModelId = toXDriveAntigravityModelId(acpResult.modelId)
      const parsed = parseMarbleAcpResponse(
        acpResult.text,
        collaborateInput,
        resolvedModelId,
      )

      return json({
        ok: true,
        source: 'antigravity-acp',
        proposal: parsed.proposal,
        stages: parsed.stages,
        newDocument: parsed.newDocument,
        thoughts: acpResult.thoughts,
        runtime: {
          protocol: 'acp',
          agentName: acpResult.agentName,
          agentVersion: acpResult.agentVersion,
          modelId: resolvedModelId,
          acpModelId: acpResult.modelId,
          stopReason: acpResult.stopReason,
        },
      })
    }

    return json(
      {
        ok: false,
        error:
          'Expected action status, authenticate, logout, install_binary, or collaborate',
      },
      400,
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute('/api/ai')({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
})
