// Core domain models and types for xDrive — AI-Enabled Marble (.mrbl) Research Workspace

export type MarbleOpType =
  | 'setText'
  | 'setInner'
  | 'setAttr'
  | 'insert'
  | 'move'
  | 'remove'
  | 'assignId'

export interface MarbleOp {
  type: MarbleOpType
  id?: string
  text?: string
  html?: string
  name?: string
  value?: string | null
  parentId?: string
  beforeId?: string | null
  path?: number[]
  look?: boolean
}

export interface EvergreenDocRef {
  slug: string
  fileName: string
  title: string
  ruleCount: number
}

export interface MarbleOpProposal {
  id: string
  note: string
  stage?: string
  ops: MarbleOp[]
  inverseOps?: MarbleOp[]
  targetIds: string[]
  modelId: string
  providerId: AIProviderId
  createdAt: number
  status: 'proposed' | 'committed' | 'discarded' | 'thinking' | 'failed'
  sketchDataUrl?: string
  sketchAnnotations?: SketchAnnotation[]
  instruction: string
  referencedEvergreenDocs?: EvergreenDocRef[]
}

export type MarbleAppCategory =
  | 'latex'
  | 'notebook'
  | 'document'
  | 'slides'
  | 'matrix'
  | 'sandbox'
  | 'custom'

export type SharePermissionLevel =
  | 'view_only' // Look & read only: data-marble-look allowed in visitor tab, no persistent edits, no AI
  | 'comment_annotate' // Can add data-marble-note annotations & propose AI ops to review tray, cannot commit directly
  | 'edit_no_ai' // Can directly manipulate the app (data-marble-editable, sortable, add, remove) without AI
  | 'edit_with_ai_byok' // Full direct edit + AI collaboration using visitor's own connected AI subscription
  | 'edit_with_ai_shared' // Full direct edit + AI collaboration using owner's shared AI quota

export interface ShareCollaborator {
  id: string
  name: string
  email: string
  avatarInitials: string
  avatarColor: string
  permission: SharePermissionLevel
  addedAt: string
  lastActive?: string
}

export interface ShareConfig {
  isPublicLinkEnabled: boolean
  publicLinkUrl: string
  publicPermission: SharePermissionLevel
  allowDuplication: boolean
  sharedAiDailyLimit: number
  sharedAiUsedToday: number
  collaborators: ShareCollaborator[]
}

export interface MarbleCheckpoint {
  sha: string
  label: string
  timestamp: number
  author: string
  opsCount: number
  source: string
  note?: string
}

export type DriveFolderColor =
  | 'default'
  | 'accent'
  | 'commit'
  | 'sketch'
  | 'danger'

export interface DriveFolder {
  id: string
  name: string
  parentId: string | null
  color?: DriveFolderColor
  createdAt: string
  updatedAt: string
}

export interface MarbleDocumentFile {
  id: string
  slug: string
  fileName: string // e.g. "quantum-error-correction.mrbl"
  title: string
  description: string
  category: MarbleAppCategory
  isTemplate: boolean
  isEvergreen?: boolean
  templateId?: string
  source: string // Full valid .mrbl HTML5 source code
  nodeCount: number // Count of data-marble-id elements
  byteSize: number
  version: number
  syncState: 'saved' | 'saving' | 'proposed' | 'retrying' | 'offline'
  createdAt: string
  updatedAt: string
  createdBy: {
    name: string
    initials: string
    isAi?: boolean
    modelBadge?: string
  }
  lastEditedBy: {
    name: string
    initials: string
    isAi?: boolean
    modelBadge?: string
  }
  starred: boolean
  pinned: boolean
  tags: string[]
  folder: string
  folderId?: string | null
  share: ShareConfig
  checkpoints: MarbleCheckpoint[]
  intentHistory: MarbleOpProposal[]
}

export type AIProviderId =
  | 'antigravity'
  | 'opencode-go'
  | 'xai'
  | 'claude'
  | 'openai'

export interface AIModelSpec {
  id: string
  name: string
  providerId: AIProviderId
  badge: string
  role: 'implementation' | 'exploration' | 'review' | 'design' | 'reasoning'
  contextWindow: string
  speedTier: 'instant' | 'fast' | 'deep'
  supportsVisionSketch: boolean
  recommendedFor: string
}

export interface AISubscription {
  providerId: AIProviderId
  name: string
  tagline: string
  planName: string
  connected: boolean
  authMethod: 'antigravity_acp' | 'subscription_oauth' | 'api_key' | 'cli_bridge'
  maskedCredential?: string
  status: 'active' | 'rate_limited' | 'disconnected'
  models: AIModelSpec[]
  defaultModelId: string
  usageThisMonth: {
    opsGenerated: number
    appsBuilt: number
    quotaPercent: number
  }
  endpointUrl: string
}

export type CanvasInteractionMode =
  | 'direct' // Normal direct manipulation of .mrbl app (editable, sortable, canvas, etc.)
  | 'select' // Marquee area selection / shift-click element targeting + corner scale handles
  | 'sketch' // Freehand sketch & callout annotation over the app canvas for AI instructions
  | 'source' // Side-by-side live .mrbl app + byte-accurate HTML5 source & node inspector

export interface SketchStroke {
  id: string
  tool: 'pen' | 'arrow' | 'rect' | 'highlight' | 'callout'
  color: string
  points: Array<{ x: number; y: number }>
  label?: string
  targetNodeId?: string
}

export interface SketchAnnotation {
  id: string
  kind: 'freehand' | 'box' | 'arrow' | 'callout'
  label: string
  boundingBox: { x: number; y: number; width: number; height: number }
  coveredNodeIds: string[]
  color: string
}

export interface SelectedMarbleElement {
  id: string // data-marble-id
  tagName: string
  textPreview: string
  sourceSlice: string
  affordances: string[]
  rect?: { left: number; top: number; width: number; height: number }
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  modelId?: string
  providerId?: AIProviderId
  runtimeSource?: 'antigravity-acp' | 'opencode-go' | 'api' | 'synthesizer'
  thoughts?: string[]
  attachedElements?: SelectedMarbleElement[]
  attachedSketches?: SketchAnnotation[]
  proposal?: MarbleOpProposal
  stages?: Array<{
    stageNumber: number
    totalStages: number
    note: string
    ops: MarbleOp[]
    completed: boolean
  }>
}
