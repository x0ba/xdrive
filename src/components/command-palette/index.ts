export { CommandPalette } from './CommandPalette'
export type { CommandPaletteProps } from './CommandPalette'

export { WorkspaceCommandPalette } from './WorkspaceCommandPalette'
export type { WorkspaceCommandPaletteProps } from './WorkspaceCommandPalette'

export {
  CommandSourceRegistry,
  defaultCommandRegistry,
  executeCommandSources,
  mergeCommandSources,
  registerCommandSource,
} from './registry'
export type { CommandQueryState, CommandSourceError } from './registry'

export {
  fuzzyMatch,
  groupRankedItems,
  mergeRanges,
  normalizeQuery,
  parseRecencyMs,
  rankCommandItems,
  scoreCommandItem,
  splitHighlightRanges,
} from './fuzzy'

export {
  formatCommandPaletteShortcut,
  getCommandPaletteShortcutKeys,
  isCommandPaletteShortcut,
  isMacPlatform,
  shouldIgnoreCommandPaletteShortcut,
  useCommandPaletteShortcutLabel,
} from './shortcuts'
export type { PlatformLikeNavigator } from './shortcuts'

export {
  createActionsSource,
  createBuiltinCommandSources,
  createCreateSource,
  createNavigationSource,
  createRecentSource,
} from './sources'
export type { WorkspaceCommandSourceDeps } from './sources'

export { BUILTIN_SECTION_LABELS, BUILTIN_SECTION_ORDER } from './types'
export type {
  CommandContext,
  CommandItem,
  CommandSectionGroup,
  CommandSectionId,
  CommandSource,
  FuzzyMatchResult,
  RankedCommandItem,
} from './types'
