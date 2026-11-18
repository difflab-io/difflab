import { cva, type VariantProps } from 'class-variance-authority'

// Constants -------------------------------------------------------------------
export const projectKeyPillVariants = cva(
  'inline-flex shrink-0 items-center rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] leading-3.5 font-semibold tracking-tight text-foreground',
)

// Types -----------------------------------------------------------------------
export type ProjectKeyPillVariants = VariantProps<typeof projectKeyPillVariants>
