// Shared isomorphic types for xDrive Drive-wide AI Chat.

import type {
  AIProviderId,
  DriveFolderColor,
  MarbleAppCategory,
  MarbleOp,
} from '#/lib/types'

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'max'

const REASONING_EFFORT_VALUES: ReadonlySet<string> = new Set<ReasoningEffort>([
  'off',
  'low',
  'medium',
  'high',
  'max',
])

/** Parse a provider or request value into the effort the UI and ACP clients share. */
export function parseReasoningEffort(
  value: unknown,
): ReasoningEffort | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.trim().toLowerCase()
  if (clean === 'xhigh' || clean === 'extra-high' || clean === 'extra_high') {
    return 'max'
  }
  if (clean === 'none' || clean === 'minimal' || clean === 'disabled') {
    return 'off'
  }
  if (REASONING_EFFORT_VALUES.has(clean)) return clean as ReasoningEffort
  return undefined
}

export type DriveChatMode = 'ask' | 'review' | 'auto'

export interface DriveChatModelOption {
  id: string
  name: string
  providerId: AIProviderId
  providerName: string
  connected: boolean
  status: 'active' | 'rate_limited' | 'disconnected'
  contextWindow: string
  speedTier: 'instant' | 'fast' | 'deep'
  supportsVision: boolean
  supportsReasoning: boolean
  reasoningEfforts: ReasoningEffort[]
  description?: string
  badge?: string
  isFree?: boolean
}

export type DriveContextRef =
  | {
      kind: 'doc'
      id: string
      title: string
      fileName: string
      category: MarbleAppCategory
    }
  | {
      kind: 'folder'
      id: string
      name: string
    }

export interface DriveDocumentSnapshot {
  id: string
  slug: string
  fileName: string
  title: string
  description: string
  category: MarbleAppCategory
  folderId: string | null
  folderPath: string
  starred: boolean
  pinned: boolean
  isEvergreen?: boolean
  trashedAt?: string | null
  tags: string[]
  nodeCount: number
  byteSize: number
  updatedAt: string
  textDigest: string
  marbleIds: string[]
  /** Full .mrbl HTML5 source included for focused or query-relevant documents. */
  source?: string
}

export interface DriveFolderSnapshot {
  id: string
  name: string
  parentId: string | null
  path: string
  color?: DriveFolderColor
}

export interface DriveSnapshot {
  docs: DriveDocumentSnapshot[]
  trashedDocs: DriveDocumentSnapshot[]
  folders: DriveFolderSnapshot[]
  focusedRefs: DriveContextRef[]
}

export type DriveChatActionStatus =
  'proposed' | 'applied' | 'discarded' | 'undone' | 'failed'

export interface DriveChatActionBase {
  id: string
  label: string
  summary: string
  status: DriveChatActionStatus
  error?: string
}

export interface EditDocumentAction extends DriveChatActionBase {
  kind: 'edit_document'
  docId: string
  docTitle: string
  fileName: string
  ops: MarbleOp[]
  replacementSource?: string
  diffPreview?: string[]
}

export interface CreateDocumentAction extends DriveChatActionBase {
  kind: 'create_document'
  title: string
  slug: string
  category: MarbleAppCategory
  description: string
  tags: string[]
  folderId: string | null
  folderName: string
  source: string
  createdDocId?: string
}

export interface RenameDocumentAction extends DriveChatActionBase {
  kind: 'rename_document'
  docId: string
  docTitle: string
  nextTitle: string
  nextDescription?: string
  nextTags?: string[]
}

export interface MoveDocumentAction extends DriveChatActionBase {
  kind: 'move_document'
  docId: string
  docTitle: string
  fromFolderName?: string
  targetFolderId: string | null
  targetFolderName: string
}

export interface UpdateDocumentMetaAction extends DriveChatActionBase {
  kind: 'update_document_meta'
  docId: string
  docTitle: string
  starred?: boolean
  pinned?: boolean
  tags?: string[]
  description?: string
}

export interface TrashDocumentAction extends DriveChatActionBase {
  kind: 'trash_document'
  docId: string
  docTitle: string
}

export interface RestoreDocumentAction extends DriveChatActionBase {
  kind: 'restore_document'
  docId: string
  docTitle: string
}

export interface CreateFolderAction extends DriveChatActionBase {
  kind: 'create_folder'
  name: string
  parentId: string | null
  parentPath: string
  color: DriveFolderColor
  createdFolderId?: string
}

export interface RenameFolderAction extends DriveChatActionBase {
  kind: 'rename_folder'
  folderId: string
  folderName: string
  nextName: string
  nextColor?: DriveFolderColor
}

export interface DeleteFolderAction extends DriveChatActionBase {
  kind: 'delete_folder'
  folderId: string
  folderName: string
}

export type DriveChatAction =
  | EditDocumentAction
  | CreateDocumentAction
  | RenameDocumentAction
  | MoveDocumentAction
  | UpdateDocumentMetaAction
  | TrashDocumentAction
  | RestoreDocumentAction
  | CreateFolderAction
  | RenameFolderAction
  | DeleteFolderAction

export interface DriveChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  modelId?: string
  modelName?: string
  providerId?: AIProviderId
  reasoningEffort?: ReasoningEffort
  mode?: DriveChatMode
  thoughts?: string[]
  thinkingDurationMs?: number
  isStreaming?: boolean
  streamingPhase?: 'thinking' | 'answering' | 'preparing_actions'
  contextRefs?: DriveContextRef[]
  referencedDocIds?: string[]
  actions?: DriveChatAction[]
  error?: string
}

export interface DriveChatThread {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  pinned?: boolean
  modelId: string
  reasoningEffort: ReasoningEffort
  mode: DriveChatMode
  messages: DriveChatMessage[]
}

export interface DriveChatApiRequest {
  threadId: string
  modelId: string
  providerId: AIProviderId
  reasoningEffort: ReasoningEffort
  mode: DriveChatMode
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  drive: DriveSnapshot
}

export type DriveChatStreamEvent =
  | {
      type: 'status'
      phase: 'thinking' | 'answering' | 'preparing_actions'
      label: string
    }
  | { type: 'thought_delta'; delta: string }
  | { type: 'text_delta'; delta: string }
  | {
      type: 'done'
      answer: string
      thoughts: string[]
      referencedDocIds: string[]
      actions: DriveChatAction[]
      runtime: {
        providerId: AIProviderId
        modelId: string
        protocol: string
        stopReason: string
      }
    }
  | {
      type: 'error'
      code: string
      error: string
      authRequired?: boolean
      entitlementRequired?: boolean
      rateLimited?: boolean
      providerId?: AIProviderId
    }

export const REASONING_EFFORT_META: Record<
  ReasoningEffort,
  { label: string; shortLabel: string; description: string; bars: number }
> = {
  off: {
    label: 'Off',
    shortLabel: 'No reasoning',
    description: 'Direct response without extended thinking',
    bars: 0,
  },
  low: {
    label: 'Low',
    shortLabel: 'Low',
    description: 'Fast checks and quick Drive lookups',
    bars: 1,
  },
  medium: {
    label: 'Medium',
    shortLabel: 'Medium',
    description: 'Balanced depth for synthesis and edits',
    bars: 2,
  },
  high: {
    label: 'High',
    shortLabel: 'High',
    description: 'Thorough cross-file reasoning and refactors',
    bars: 3,
  },
  max: {
    label: 'Max',
    shortLabel: 'Max',
    description: 'Deepest verification across complex manuscripts',
    bars: 4,
  },
}

export const DRIVE_CHAT_MODE_META: Record<
  DriveChatMode,
  { label: string; shortLabel: string; description: string }
> = {
  ask: {
    label: 'Ask only',
    shortLabel: 'Ask',
    description:
      'Query, compare, and inspect Drive files without modifying anything',
  },
  review: {
    label: 'Review changes',
    shortLabel: 'Review',
    description:
      'Propose Drive edits and organization as cards you approve or discard',
  },
  auto: {
    label: 'Auto-apply',
    shortLabel: 'Auto-apply',
    description:
      'Apply Drive changes immediately with one-click Undo on every action',
  },
}
