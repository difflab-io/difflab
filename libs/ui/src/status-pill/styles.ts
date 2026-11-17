import { cva, type VariantProps } from 'class-variance-authority'
import type { StatusTone } from './types.js'

// Constants -------------------------------------------------------------------
export const statusPillVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium tracking-tight whitespace-nowrap select-none',
  {
    variants: {
      tone: {
        info: 'border-[color-mix(in_oklab,var(--info)_38%,var(--border))] bg-[color-mix(in_oklab,var(--info)_14%,transparent)] text-[var(--info)]',
        success:
          'border-[color-mix(in_oklab,var(--success)_38%,var(--border))] bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)]',
        warn: 'border-[color-mix(in_oklab,var(--warn)_38%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-[var(--warn)]',
        danger:
          'border-[color-mix(in_oklab,var(--danger)_42%,var(--border))] bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]',
        accent:
          'border-[color-mix(in_oklab,var(--chart-4)_38%,var(--border))] bg-[color-mix(in_oklab,var(--chart-4)_14%,transparent)] text-[var(--chart-4)]',
        neutral: 'border-border bg-secondary text-muted-foreground',
      },
      size: {
        xs: 'px-1.5 py-0 text-[10px] leading-4',
        sm: 'px-2 py-0.5 text-[11px] leading-4',
        md: 'px-2.5 py-0.5 text-xs leading-4',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      size: 'sm',
    },
  },
)

// Types -----------------------------------------------------------------------
export type StatusPillVariants = VariantProps<typeof statusPillVariants>

// API -------------------------------------------------------------------------
export function inferStatusTone(status: string): StatusTone {
  const normalized = status.trim().toLowerCase()
  if (
    normalized === 'running' ||
    normalized === 'in progress' ||
    normalized === 'in_progress' ||
    normalized === 'app'
  ) {
    return 'info'
  }
  if (
    normalized === 'done' ||
    normalized === 'completed' ||
    normalized === 'approved' ||
    normalized === 'ready' ||
    normalized === 'herdr'
  ) {
    return 'success'
  }
  if (normalized === 'queued' || normalized === 'draft' || normalized === 'todo') {
    return 'warn'
  }
  if (normalized === 'failed' || normalized === 'blocked' || normalized === 'error') {
    return 'danger'
  }
  if (normalized === 'library') {
    return 'accent'
  }
  return 'neutral'
}
