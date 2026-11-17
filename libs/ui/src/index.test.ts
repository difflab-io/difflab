import { describe, expect, it } from 'bun:test'
import { appRailButtonVariants } from './app-rail/styles.js'
import { flowDagNodeVariants } from './flow-dag/styles.js'
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
})
