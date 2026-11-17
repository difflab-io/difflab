import { cva, type VariantProps } from 'class-variance-authority'

// Constants -------------------------------------------------------------------
export const repositoryTableRowVariants = cva('transition-colors hover:bg-accent/35')

export const repositoryTableCellVariants = cva('px-3.5 py-2.5 text-left align-middle')

// Types -----------------------------------------------------------------------
export type RepositoryTableRowVariants = VariantProps<typeof repositoryTableRowVariants>
