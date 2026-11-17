import { cva, type VariantProps } from 'class-variance-authority'

// Constants -------------------------------------------------------------------
export const repoGraphRowVariants = cva(
  'grid grid-cols-1 items-start gap-2.5 border-b border-border/70 px-3.5 py-3 last:border-b-0 md:grid-cols-[minmax(190px,240px)_28px_1fr]',
)

export const repoNodeBoxVariants = cva(
  'flex min-w-0 flex-col gap-1 rounded-md border border-border bg-background/80 px-2.5 py-2 transition-colors hover:border-foreground/25',
)

export const componentChipVariants = cva(
  'inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-xs transition-colors hover:border-foreground/25',
)

// Types -----------------------------------------------------------------------
export type RepoGraphRowVariants = VariantProps<typeof repoGraphRowVariants>
