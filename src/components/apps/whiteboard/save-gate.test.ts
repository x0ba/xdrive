import { describe, expect, it } from 'vitest'

import { canMarkPersistedSourceSaved } from './save-gate'

const SOURCE = '<html>board-a</html>'

describe('canMarkPersistedSourceSaved', () => {
  it('marks saved only when the written source is the one on screen and idle', () => {
    expect(
      canMarkPersistedSourceSaved({
        writtenSource: SOURCE,
        displayedSource: SOURCE,
        saveOrLifecyclePending: false,
        editorAheadOfDisplayedSource: false,
      }),
    ).toBe(true)
  })

  it('stays saving while a save or lifecycle mutation is pending', () => {
    expect(
      canMarkPersistedSourceSaved({
        writtenSource: SOURCE,
        displayedSource: SOURCE,
        saveOrLifecyclePending: true,
        editorAheadOfDisplayedSource: false,
      }),
    ).toBe(false)
  })

  it('stays saving while the canvas is ahead of the file', () => {
    expect(
      canMarkPersistedSourceSaved({
        writtenSource: SOURCE,
        displayedSource: SOURCE,
        saveOrLifecyclePending: false,
        editorAheadOfDisplayedSource: true,
      }),
    ).toBe(false)
  })

  it('does not mark saved when the file that landed differs from the screen', () => {
    expect(
      canMarkPersistedSourceSaved({
        writtenSource: SOURCE,
        displayedSource: '<html>board-b</html>',
        saveOrLifecyclePending: false,
        editorAheadOfDisplayedSource: false,
      }),
    ).toBe(false)
    expect(
      canMarkPersistedSourceSaved({
        writtenSource: SOURCE,
        displayedSource: undefined,
        saveOrLifecyclePending: false,
        editorAheadOfDisplayedSource: false,
      }),
    ).toBe(false)
  })
})
