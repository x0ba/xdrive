export type SlideAspectRatio = '16:9' | '16:10' | '4:3'

export type SlideLayoutKind =
  | 'title'
  | 'title-body'
  | 'section'
  | 'two-col'
  | 'big-number'
  | 'caption'
  | 'blank'

export type SlideTransitionKind =
  'none' | 'fade' | 'slide-left' | 'slide-right' | 'zoom'

export type SlideElementKind =
  'text' | 'shape' | 'chart' | 'table' | 'image' | 'line'

export type SlideShapeKind =
  'rect' | 'rounded' | 'ellipse' | 'diamond' | 'arrow' | 'callout'

export interface SlideChartDatum {
  label: string
  value: number
  highlight?: boolean
}

export interface SlideElement {
  id: string
  kind: SlideElementKind
  x: number // percent 0..100
  y: number // percent 0..100
  w: number // percent 1..100
  h: number // percent 1..100
  rotation?: number
  opacity?: number
  text?: string
  fontFamily?: string
  fontSize?: number // px at 960x540 base stage
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold'
  italic?: boolean
  underline?: boolean
  color?: string
  align?: 'left' | 'center' | 'right'
  fill?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  shapeKind?: SlideShapeKind
  chartData?: SlideChartDatum[]
  tableData?: string[][]
  imageUrl?: string
}

export interface SlidePage {
  id: string
  title: string
  layout: SlideLayoutKind
  background?: string
  transition: SlideTransitionKind
  transitionMs: number
  skipped?: boolean
  speakerNotes: string
  elements: SlideElement[]
}

export interface SlideThemeSpec {
  id: string
  name: string
  description: string
  surface: string
  card: string
  ink: string
  muted: string
  accent: string
  good: string
  border: string
  headingFont: string
  bodyFont: string
}

export interface SlidesDeckState {
  title: string
  starred: boolean
  themeId: string
  aspectRatio: SlideAspectRatio
  slides: SlidePage[]
  activeSlideId: string
}

export type SlidesInspectorTab =
  'none' | 'theme' | 'layout' | 'background' | 'transition' | 'format'
