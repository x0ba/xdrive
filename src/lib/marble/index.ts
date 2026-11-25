export {
  applyDocumentContentUpdate,
  applyMarbleOpsClient,
  buildInteractiveMarbleIframeDoc,
  byteSizeOf,
  countMarbleNodes,
  duplicateMarbleTemplate,
  escapeText,
  extractAddressableNodes,
  inspectMarbleNodes,
} from './engine-client'
export type { MarbleIframeOptions, MarbleNodeRecord } from './engine-client'

export {
  DOCUMENT_DESIGN_SYSTEM_ID,
  DOCUMENT_DESIGN_SYSTEM_SLUG,
  DOCUMENT_DONTS_SYSTEM_ID,
  DOCUMENT_DONTS_SYSTEM_SLUG,
  EVERGREEN_WORKSPACE_DOCS,
  INITIAL_WORKSPACE_DOCS,
  MARBLE_BASE_CSS,
  PREDEFINED_MARBLE_TEMPLATES,
} from './templates'

export { INITIAL_AI_SUBSCRIPTIONS } from './subscriptions-seed'

export {
  MarbleCollaborationError,
  detectMarbleAction,
  generateMarbleCollaboration,
  resolveEvergreenDesignContext,
  sanitizeHtmlWithEvergreenRules,
  sanitizeTextWithDonts,
  synthesizeMarbleOps,
} from './ai-collaborator'
export type {
  CollaborationRequest,
  CollaborationResult,
  EvergreenDesignContext,
  MarbleActionKind,
} from './ai-collaborator'
