// Types -----------------------------------------------------------------------
export type StatusTone = 'info' | 'success' | 'warn' | 'danger' | 'neutral' | 'accent'

export interface StatusPillProps {
  status: string
  tone?: StatusTone
  size?: 'xs' | 'sm' | 'md'
  pulse?: boolean
  testId?: string
  class?: string
}
