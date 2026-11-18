// Types -----------------------------------------------------------------------
export type MarkdownSegment =
  | { kind: 'prose'; html: string }
  | { kind: 'mermaid'; code: string }
  | { kind: 'code'; code: string; language: string }

export interface MarkdownDocumentProps {
  markdown: string
  stripTitle?: boolean
  size?: 'sm' | 'base' | 'lg'
  class?: string
}
