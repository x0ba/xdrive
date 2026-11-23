export { SlidesApp, type SlidesAppProps } from './SlidesApp'
export { SlideCanvas, type SlideCanvasProps } from './SlidesCanvas'
export { SlidesFilmstrip, type SlidesFilmstripProps } from './SlidesFilmstrip'
export {
  SlidesInspectorPanel,
  SlidesPresentOverlay,
  type SlidesInspectorPanelProps,
  type SlidesPresentOverlayProps,
} from './SlidesPanelsAndPresent'
export {
  DEFAULT_SLIDES_DECK,
  SLIDE_THEMES,
  createElementsForLayout,
  createSlideFromLayout,
  getSlideTheme,
} from './themes'
export {
  parseSlidesFromMarbleSource,
  serializeSlidesToMarbleSource,
} from './serialization'
export type {
  SlideAspectRatio,
  SlideChartDatum,
  SlideElement,
  SlideElementKind,
  SlideLayoutKind,
  SlidePage,
  SlideShapeKind,
  SlidesDeckState,
  SlidesInspectorTab,
  SlideThemeSpec,
  SlideTransitionKind,
} from './types'
