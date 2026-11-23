export type DocsEditMode = 'editing' | 'suggesting' | 'viewing'
export type DocsOrientation = 'portrait' | 'landscape'
export type DocsPaperSize = 'letter' | 'a4' | 'legal'

export interface DocsPageSetup {
  pageless: boolean
  orientation: DocsOrientation
  paperSize: DocsPaperSize
  marginTop: number // inches
  marginBottom: number
  marginLeft: number
  marginRight: number
  columns: 1 | 2 | 3
  lineSpacing: number
  showHeaderFooter: boolean
  headerText: string
  footerText: string
}

export interface DocsCommentReply {
  id: string
  author: string
  initials: string
  body: string
  createdAt: string
}

export interface DocsComment {
  id: string
  author: string
  initials: string
  quote: string
  body: string
  createdAt: string
  resolved: boolean
  kind: 'comment' | 'suggestion'
  suggestionReplace?: string
  replies: DocsCommentReply[]
}

export interface DocsOutlineItem {
  id: string
  level: 1 | 2 | 3
  text: string
}

export interface DocsState {
  title: string
  starred: boolean
  folder: string
  html: string
  pageSetup: DocsPageSetup
  comments: DocsComment[]
}

export const DEFAULT_DOCS_PAGE_SETUP: DocsPageSetup = {
  pageless: false,
  orientation: 'portrait',
  paperSize: 'letter',
  marginTop: 0.9,
  marginBottom: 0.9,
  marginLeft: 0.95,
  marginRight: 0.95,
  columns: 1,
  lineSpacing: 1.55,
  showHeaderFooter: true,
  headerText: 'Lattice Lab · Research Specification',
  footerText: 'Confidential draft — xDrive',
}
