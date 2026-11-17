import { cva, type VariantProps } from 'class-variance-authority'

// Constants -------------------------------------------------------------------
export const flowDagNodeVariants = cva(
  'group flex min-w-44 flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-all',
  {
    variants: {
      selected: {
        true: 'border-[var(--info)] bg-[color-mix(in_oklab,var(--info)_10%,var(--card))] shadow-xs',
        false: 'border-border bg-background/80 hover:border-foreground/30 hover:bg-accent/35',
      },
      status: {
        pending: '',
        running: 'border-[color-mix(in_oklab,var(--info)_50%,var(--border))]',
        done: '',
        failed: 'border-[color-mix(in_oklab,var(--danger)_50%,var(--border))]',
      },
    },
    defaultVariants: {
      selected: false,
      status: 'pending',
    },
  },
)

// Types -----------------------------------------------------------------------
export type FlowDagNodeVariants = VariantProps<typeof flowDagNodeVariants>
