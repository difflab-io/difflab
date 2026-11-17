import { cva, type VariantProps } from 'class-variance-authority'

// Constants -------------------------------------------------------------------
export const appRailButtonVariants = cva(
  'group relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-ring/60',
  {
    variants: {
      active: {
        true: 'bg-sidebar-accent text-sidebar-accent-foreground shadow-2xs',
        false:
          'bg-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
      },
    },
    defaultVariants: {
      active: false,
    },
  },
)

// Types -----------------------------------------------------------------------
export type AppRailButtonVariants = VariantProps<typeof appRailButtonVariants>
