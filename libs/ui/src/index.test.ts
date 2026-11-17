import { describe, expect, it } from 'bun:test'
import { appRailButtonVariants } from './app-rail/styles.js'
import { flowDagNodeVariants } from './flow-dag/styles.js'
import { segmentMarkdown } from './markdown-view/parser.js'
import { inferStatusTone, statusPillVariants } from './status-pill/styles.js'
import { themeToggleVariants } from './theme-toggle/styles.js'

// Tests -----------------------------------------------------------------------
describe('Given shared Difflab Helical UI style primitives', () => {
  describe('When inferring semantic tones from workflow and taxonomy statuses', () => {
    it('Then maps active, completed, failed, and component labels to matching Helical tones', () => {
      // Arrange
      const statuses = ['running', 'done', 'queued', 'blocked', 'App', 'Library', 'pending']

      // Act
      const tones = statuses.map((s) => inferStatusTone(s))

      // Assert
      expect(tones).toEqual(['info', 'success', 'warn', 'danger', 'info', 'accent', 'neutral'])
    })
  })

  describe('When resolving CVA classes for rail, DAG, status, and theme controls', () => {
    it('Then emits non-empty class strings reflecting active and selected states', () => {
      // Arrange & Act
      const activeRail = appRailButtonVariants({ active: true })
      const selectedStep = flowDagNodeVariants({ selected: true, status: 'running' })
      const runningPill = statusPillVariants({ tone: 'info', size: 'sm' })
      const toggle = themeToggleVariants({ size: 'sm', variant: 'ghost' })

      // Assert
      expect(activeRail).toContain('bg-sidebar-accent')
      expect(selectedStep).toContain('border-[var(--info)]')
      expect(runningPill).toContain('text-[var(--info)]')
      expect(toggle).toContain('helical-theme-toggle')
    })
  })

  describe('When segmenting PLAN.md or REVIEW.md Markdown for Helical Prose, Mermaid, and CodeBlock', () => {
    it('Then strips the leading H1 title, extracts mermaid and code fences, and escapes angle-bracket placeholders', () => {
      // Arrange
      const sample = [
        '# Sample Plan Title',
        '',
        '- **Status:** completed',
        '- Path: ~/.difflab/projects/<KEY>/<repo-slug>',
        '',
        '```mermaid',
        'flowchart LR',
        '  A --> B',
        '```',
        '',
        '```ts',
        'export const ok = true',
        '```',
      ].join('\n')

      // Act
      const segments = segmentMarkdown(sample, { stripTitle: true })

      // Assert
      expect(segments.map((s) => s.kind)).toEqual(['prose', 'mermaid', 'code'])
      expect(segments[0]?.kind === 'prose' ? segments[0].html : '').not.toContain(
        'Sample Plan Title',
      )
      expect(segments[0]?.kind === 'prose' ? segments[0].html : '').toContain('&lt;KEY&gt;')
      expect(segments[1]).toEqual({ kind: 'mermaid', code: 'flowchart LR\n  A --> B' })
      expect(segments[2]).toEqual({
        kind: 'code',
        code: 'export const ok = true',
        language: 'ts',
      })
    })
  })
})
