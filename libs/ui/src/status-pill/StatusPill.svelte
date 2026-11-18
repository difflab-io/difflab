<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { inferStatusTone, statusPillVariants } from './styles.js'
  import type { StatusPillProps } from './types.js'

  // API -----------------------------------------------------------------------
  let {
    status,
    tone,
    size = 'sm',
    pulse,
    testId,
    class: className = '',
  }: StatusPillProps = $props()

  const resolvedTone = $derived(tone ?? inferStatusTone(status))
  const shouldPulse = $derived(pulse ?? status.trim().toLowerCase() === 'running')
  const classes = $derived(cn(statusPillVariants({ tone: resolvedTone, size }), className))
</script>

<span class={classes} data-slot="status-pill" data-status={status} data-testid={testId}>
  {#if shouldPulse}
    <span class="size-1.5 animate-pulse rounded-full bg-current"></span>
  {/if}
  <span>{status}</span>
</span>
