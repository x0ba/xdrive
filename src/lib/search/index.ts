export {
  SEARCH_ITEM_TYPES,
  normalizeSearchType,
  type IndexableItem,
  type SearchDriveCounts,
  type SearchDriveOptions,
  type SearchDriveResponse,
  type SearchFilterType,
  type SearchItemType,
  type SearchMatchRange,
  type SearchMatchedField,
  type SearchResultItem,
} from './types'

export {
  extractChatMessagesText,
  extractMarbleDocumentText,
  extractWhiteboardText,
} from './extract'

export {
  DriveSearchIndex,
  buildClientSearchIndex,
  buildSnippetAndHighlights,
  findHighlightRanges,
  normalizeToken,
  resolveMarbleSearchType,
  tokenize,
  tokenizeWithSpans,
} from './index-engine'

export { DriveSearchError, fetchDriveSearch } from './client'
