import { cva } from 'class-variance-authority'

// Constants -------------------------------------------------------------------
/** Orthogonal `cva` variants for `AuthCard` using helical-ui theme tokens. */
export const authCardVariants = cva(
  'w-full max-w-md border border-border bg-card text-card-foreground shadow-sm',
  {
    variants: {
      size: {
        sm: 'p-4',
        md: 'p-6',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
)

/** Styling for the identity summary panel inside `AuthCard`. */
export const authIdentityBoxClass =
  'w-full rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground'

/** Styling for inline authentication error banners inside `AuthCard`. */
export const authErrorClass =
  'w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
