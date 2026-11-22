export {
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
  INITIAL_WORKSPACE_DOCS,
  PREDEFINED_MARBLE_TEMPLATES,
} from './templates'

export { INITIAL_AI_SUBSCRIPTIONS } from './subscriptions-seed'

export {
  detectMarbleAction,
  generateMarbleCollaboration,
  synthesizeMarbleOps,
} from './ai-collaborator'
export type {
  CollaborationRequest,
  CollaborationResult,
  MarbleActionKind,
} from './ai-collaborator'
