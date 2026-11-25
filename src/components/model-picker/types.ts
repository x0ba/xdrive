import type { AIModelSpec, AIProviderId, AISubscription } from '#/lib/types'
import type {
  DriveChatModelOption,
  ReasoningEffort,
} from '#/lib/ai/drive-chat-types'

export const PROVIDER_DISPLAY_NAMES: Record<AIProviderId, string> = {
  antigravity: 'Google Antigravity',
  'opencode-go': 'OpenCode Go',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  xai: 'SpaceX AI / xAI',
}

/**
 * Unified model descriptor consumed by the shared T3-Code-style `ModelPicker`.
 * Compatible with `DriveChatModelOption` and adaptable from `AISubscription`,
 * `ConnectedModelOption`, and `AIModelSpec`.
 */
export interface ModelPickerOption {
  id: string
  name: string
  providerId: AIProviderId
  providerName: string
  connected: boolean
  status: 'active' | 'rate_limited' | 'disconnected'
  contextWindow?: string
  description?: string
  badge?: string
  supportsReasoning?: boolean
  reasoningEfforts?: ReasoningEffort[]
  defaultReasoningEffort?: ReasoningEffort
  isUnavailable?: boolean
}

export interface ModelPickerProviderTab {
  providerId: AIProviderId
  providerName: string
  connected: boolean
  status: 'active' | 'rate_limited' | 'disconnected'
  models: ModelPickerOption[]
}

/**
 * Lightweight legacy shape accepted by collaborator components (`FloatingPromptBar`,
 * `CursorAISidebar`, `SelectionSketchOverlay`).
 */
export interface ConnectedModelLike {
  id: string
  providerId: AIProviderId
  group: string
  label: string
  modelName: string
  rateLimited?: boolean
  supportsVisionSketch?: boolean
}

/**
 * Lightweight legacy shape accepted by `NewAppModal` and `AgentHeroComposer`.
 */
export type ComposerModelLike = Pick<
  AIModelSpec,
  'id' | 'name' | 'providerId' | 'badge' | 'role'
>

export type ModelPickerInputOption =
  | ModelPickerOption
  | DriveChatModelOption
  | ConnectedModelLike
  | ComposerModelLike

function isModelPickerOption(
  item: ModelPickerInputOption,
): item is ModelPickerOption | DriveChatModelOption {
  return 'providerName' in item && 'connected' in item && 'status' in item
}

function isConnectedModelLike(
  item: ModelPickerInputOption,
): item is ConnectedModelLike {
  return 'modelName' in item && 'group' in item
}

/**
 * Normalizes any xDrive model option list (Drive Chat options, connected collaborator
 * options, or compact composer model specs) into `ModelPickerOption[]`.
 */
export function normalizeModelPickerOptions(
  items: ReadonlyArray<ModelPickerInputOption>,
): ModelPickerOption[] {
  return items.map((item): ModelPickerOption => {
    if (isModelPickerOption(item)) {
      return item
    }
    if (isConnectedModelLike(item)) {
      return {
        id: item.id,
        name: item.modelName,
        providerId: item.providerId,
        providerName: item.group || PROVIDER_DISPLAY_NAMES[item.providerId],
        connected: true,
        status: item.rateLimited ? 'rate_limited' : 'active',
        badge: item.group,
      }
    }
    return {
      id: item.id,
      name: item.name,
      providerId: item.providerId,
      providerName: item.badge || PROVIDER_DISPLAY_NAMES[item.providerId],
      connected: true,
      status: 'active',
      badge: item.badge,
      description: item.role,
    }
  })
}

/**
 * Converts `AISubscription[]` (or `ManagedSubscription[]`) into full
 * `ModelPickerOption[]`, preserving connected and disconnected providers so the
 * provider icon rail matches the rest of the workspace.
 */
export function modelPickerOptionsFromSubscriptions(
  subscriptions: ReadonlyArray<
    Omit<AISubscription, 'models'> & { models: ReadonlyArray<AIModelSpec> }
  >,
): ModelPickerOption[] {
  return subscriptions.flatMap((subscription) =>
    subscription.models.map((model): ModelPickerOption => {
      const connected =
        subscription.connected && subscription.status !== 'disconnected'
      return {
        id: model.id,
        name: model.name,
        providerId: subscription.providerId,
        providerName: subscription.name,
        connected,
        status: connected ? subscription.status : 'disconnected',
        contextWindow: model.contextWindow,
        description: model.recommendedFor,
        badge: model.badge,
      }
    }),
  )
}
