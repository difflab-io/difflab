<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { ArrowRight, CheckCircle2, Circle, LoaderCircle, XCircle } from 'lucide-svelte'
  import StatusPill from '../status-pill/StatusPill.svelte'
  import { flowDagNodeVariants } from './styles.js'
  import type { FlowDagGraphProps, FlowDagStepNode } from './types.js'

  // API -----------------------------------------------------------------------
  let {
    steps,
    selectedStepId = null,
    onSelectStep,
    class: className = '',
  }: FlowDagGraphProps = $props()

  const activeNode = $derived(steps.find((s) => s.stepId === selectedStepId) ?? null)

  // Helpers -------------------------------------------------------------------
  function toggleStep(stepId: string): void {
    if (!onSelectStep) return
    onSelectStep(selectedStepId === stepId ? null : stepId)
  }
</script>

{#snippet statusIcon(status: FlowDagStepNode['status'])}
  {#if status === 'done'}
    <CheckCircle2 size={13} strokeWidth={1.8} class="shrink-0 text-[var(--success)]" />
  {:else if status === 'running'}
    <LoaderCircle size={13} strokeWidth={1.8} class="shrink-0 animate-spin text-[var(--info)]" />
  {:else if status === 'failed'}
    <XCircle size={13} strokeWidth={1.8} class="shrink-0 text-[var(--danger)]" />
  {:else}
    <Circle size={13} strokeWidth={1.6} class="shrink-0 text-muted-foreground" />
  {/if}
{/snippet}

<section
  data-testid="steps-panel"
  class={cn('flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5', className)}
>
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <h2 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Task graph ({steps.length}
        {steps.length === 1 ? 'step' : 'steps'})
      </h2>
      {#if selectedStepId && onSelectStep}
        <button
          type="button"
          class="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          onclick={() => onSelectStep(null)}
        >
          Filtered: {selectedStepId} ×
        </button>
      {/if}
    </div>
    <span class="text-[11px] text-muted-foreground">Click a step to inspect handoff &amp; logs</span
    >
  </div>

  {#if steps.length === 0}
    <p class="py-3 text-xs text-muted-foreground">No checklist steps recorded for this run yet.</p>
  {:else}
    <ol class="m-0 flex list-none flex-wrap items-stretch gap-2 p-0">
      {#each steps as step, index (step.id)}
        {@const isSelected = selectedStepId === step.stepId}
        <li class="flex items-center gap-2">
          <button
            type="button"
            data-testid={`step-${step.stepId}`}
            data-status={step.status}
            class={flowDagNodeVariants({ selected: isSelected, status: step.status })}
            onclick={() => toggleStep(step.stepId)}
          >
            <div class="flex items-center justify-between gap-2">
              <span class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                {@render statusIcon(step.status)}
                <span class="font-mono text-[11px] text-muted-foreground">{step.seq}.</span>
                <span>{step.stepId}</span>
              </span>
              <StatusPill status={step.status} size="xs" />
            </div>
            <div class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              {#if step.harness}
                <span class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                  {step.harness}
                </span>
              {:else}
                <span class="font-mono text-[10px]">step {step.seq}</span>
              {/if}
              {#if step.handoff}
                <span class="max-w-36 truncate font-mono text-[10px] text-[var(--info)]">
                  handoff ready
                </span>
              {/if}
            </div>
          </button>

          {#if index < steps.length - 1}
            <ArrowRight
              size={14}
              strokeWidth={1.5}
              aria-hidden="true"
              class="shrink-0 text-muted-foreground/60"
            />
          {/if}
        </li>
      {/each}
    </ol>

    {#if activeNode && (activeNode.summary || activeNode.handoff)}
      <div class="rounded-md border border-border/80 bg-background/80 px-3 py-2 text-xs">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="font-mono text-[11px] font-semibold text-foreground">
            {activeNode.seq}. {activeNode.stepId}
          </span>
          <StatusPill status={activeNode.status} size="xs" />
        </div>
        {#if activeNode.summary}
          <p class="m-0 text-xs text-muted-foreground">{activeNode.summary}</p>
        {/if}
        {#if activeNode.handoff}
          <pre
            class="mt-1.5 mb-0 overflow-x-auto rounded bg-secondary/60 px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap text-foreground">{activeNode.handoff}</pre>
        {/if}
      </div>
    {/if}
  {/if}
</section>
