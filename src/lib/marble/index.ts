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
  updateMarbleSourceTitle,
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
  TEMPLATES_FOLDER_ID,
  TEMPLATES_FOLDER_NAME,
  isTemplatesRootFolder,
} from './templates'

export { INITIAL_AI_SUBSCRIPTIONS } from './subscriptions-seed'

export {
  DEFAULT_COLLABORATE_CLIENT_TIMEOUT_MS,
  MarbleCollaborationError,
  detectMarbleAction,
  generateMarbleCollaboration,
  resolveEvergreenDesignContext,
  sanitizeHtmlWithEvergreenRules,
  sanitizeTextWithDonts,
  synthesizeMarbleOps,
  toMarbleCollaborationError,
} from './ai-collaborator'
export type {
  CollaborationProgress,
  CollaborationProgressPhase,
  CollaborationRequest,
  CollaborationResult,
  EvergreenDesignContext,
  MarbleActionKind,
} from './ai-collaborator'

export {
  DRIVE_HIDDEN_DIRS,
  DRIVE_HIDDEN_DIR_NAMES,
  HISTORY_DIR_NAME,
  TRASH_DIR_NAME,
  XDRIVE_META_DIR_NAME,
  isHiddenDriveEntry,
} from './drive-hidden'

export {
  AUTO_SNAPSHOT_INTERVAL_MS,
  DEFAULT_VERSION_RETENTION_POLICY,
  MAX_AUTO_VERSIONS_PER_DOC,
  RETENTION_DAILY_MS,
  RETENTION_HOURLY_MS,
  RETENTION_KEEP_ALL_MS,
} from './version-history-types'
export type {
  CreateVersionResult,
  DocumentVersionDetail,
  DocumentVersionKind,
  DocumentVersionSummary,
  DocumentVersionTrigger,
  RestoreVersionResult,
  VersionRetentionPolicy,
} from './version-history-types'

export {
  computeLineDiff,
  diffMarbleDocuments,
  diffWhiteboardSnapshots,
  extractStructuredMarbleText,
} from './version-diff'
export type {
  DiffHunk,
  DiffLine,
  DiffLineKind,
  MarbleDocumentDiffResult,
  MarbleNodeChange,
  TextDiffResult,
  WhiteboardDiffSummary,
} from './version-diff'

export {
  createVersion,
  getVersion,
  listVersions,
  restoreVersion,
} from './version-history-client'
