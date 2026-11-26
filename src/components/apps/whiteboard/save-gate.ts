/**
 * A whiteboard is saved only when the source on screen is the source that
 * finished writing, and nothing for that doc is still in flight.
 * Strokes that have not been copied into the file keep the doc saving.
 */
export function canMarkPersistedSourceSaved(input: {
  writtenSource: string
  displayedSource: string | undefined
  saveOrLifecyclePending: boolean
  editorAheadOfDisplayedSource: boolean
}): boolean {
  if (input.saveOrLifecyclePending) return false
  if (input.editorAheadOfDisplayedSource) return false
  if (input.displayedSource === undefined) return false
  return input.displayedSource === input.writtenSource
}
