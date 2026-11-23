import { createFileRoute } from '@tanstack/react-router'
import {
  AntigravityAcpError,
  getAntigravityAcpManager,
} from '#/lib/ai/antigravity-acp.server'
import {
  buildMarbleAcpPrompt,
  parseMarbleAcpResponse,
} from '#/lib/ai/marble-prompt.server'
import type { ServerCollaborateInput } from '#/lib/ai/marble-prompt.server'
import { toXDriveAntigravityModelId } from '#/lib/ai/antigravity-types'

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
        code: error.code,
        authRequired: error.code === 'AUTH_REQUIRED',
        binaryMissing: error.code === 'BINARY_MISSING',
        error: error.message,
      },
      error.httpStatus,
    )
  }
  const message =
    error instanceof Error ? error.message : 'Antigravity AI request failed'
  return json({ ok: false, code: 'AI_ERROR', error: message }, 500)
}

export async function GET() {
  try {
    const status = await getAntigravityAcpManager().getStatus()
    return json(status)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST({ request }: { request: Request }) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ ok: false, error: 'Request body must be a JSON object' }, 400)
    }
    body = parsed as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'Request body must be valid JSON' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : 'collaborate'
  const manager = getAntigravityAcpManager()

  try {
    if (action === 'status') {
      const status = await manager.getStatus()
      return json(status)
    }

    if (action === 'install_binary') {
      const status = await manager.installBinary()
      return json(status)
    }

    if (action === 'authenticate') {
      const methodId =
        typeof body.methodId === 'string' && body.methodId.trim()
          ? body.methodId.trim()
          : 'oauth-personal'
      const apiKey =
        typeof body.apiKey === 'string' ? body.apiKey : undefined
      const status = await manager.authenticate(methodId, { apiKey })
      return json(status)
    }

    if (action === 'logout') {
      const status = await manager.logout()
      return json(status)
    }

    if (action === 'collaborate') {
      const instruction =
        typeof body.instruction === 'string' ? body.instruction.trim() : ''
      if (!instruction) {
        return json({ ok: false, error: 'instruction is required' }, 400)
      }

      const providerId =
        typeof body.providerId === 'string' ? body.providerId : 'antigravity'
      if (providerId !== 'antigravity') {
        return json(
          {
            ok: false,
            code: 'PROVIDER_UNAVAILABLE',
            error: `Provider "${providerId}" is not integrated on this server. Select a Google Antigravity model (Google AI plan) in Models & Providers.`,
          },
          400,
        )
      }

      const collaborateInput: ServerCollaborateInput = {
        source: typeof body.source === 'string' ? body.source : '',
        instruction,
        modelId:
          typeof body.modelId === 'string' && body.modelId.trim()
            ? body.modelId.trim()
            : 'antigravity/default',
        providerId: 'antigravity',
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

      const acpResult = await manager.runPrompt({
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
