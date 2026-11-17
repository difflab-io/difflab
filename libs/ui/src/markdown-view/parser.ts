import { Marked, type Token, type TokensList } from 'marked'
import type { MarkdownSegment } from './types.js'

// Constants -------------------------------------------------------------------
const markdownEngine = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text)
    },
  },
})

// API -------------------------------------------------------------------------
export function segmentMarkdown(
  markdown: string,
  options: { stripTitle?: boolean } = {},
): MarkdownSegment[] {
  if (!markdown.trim()) return []

  const rawTokens = markdownEngine.lexer(markdown)
  const startIndex = findBodyStartIndex(rawTokens, options.stripTitle ?? true)
  const segments: MarkdownSegment[] = []
  let proseBuffer: Token[] = []

  const flushProse = () => {
    if (proseBuffer.length === 0) return
    const tokenList = Object.assign([...proseBuffer], {
      links: rawTokens.links,
    }) as TokensList
    const html = markdownEngine.parser(tokenList).trim()
    if (html) {
      segments.push({ kind: 'prose', html })
    }
    proseBuffer = []
  }

  for (let i = startIndex; i < rawTokens.length; i++) {
    const token = rawTokens[i]
    if (!token) continue

    if (token.type === 'code') {
      flushProse()
      const lang = (token.lang ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
      if (lang === 'mermaid') {
        segments.push({ kind: 'mermaid', code: token.text })
      } else {
        segments.push({
          kind: 'code',
          code: token.text,
          language: lang || 'text',
        })
      }
      continue
    }

    proseBuffer.push(token)
  }

  flushProse()
  return segments
}

// Helpers ---------------------------------------------------------------------
function findBodyStartIndex(tokens: TokensList, stripTitle: boolean): number {
  if (!stripTitle) return 0
  let idx = 0
  while (idx < tokens.length && tokens[idx]?.type === 'space') {
    idx++
  }
  const first = tokens[idx]
  if (first && first.type === 'heading' && first.depth === 1) {
    idx++
    while (idx < tokens.length && tokens[idx]?.type === 'space') {
      idx++
    }
    return idx
  }
  return 0
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
