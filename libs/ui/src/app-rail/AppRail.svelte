<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import {
    BookOpen,
    CheckSquare,
    ClipboardList,
    GitPullRequest,
    House,
    Workflow,
  } from 'lucide-svelte'
  import { appRailButtonVariants } from './styles.js'
  import type { AppRailProps, DifflabAppId } from './types.js'

  // API -----------------------------------------------------------------------
  let { activeApp, items, onselect, class: className = '' }: AppRailProps = $props()
</script>

{#snippet appIcon(id: DifflabAppId)}
  {#if id === 'home'}
    <House size={16} strokeWidth={1.65} />
  {:else if id === 'wikis'}
    <BookOpen size={16} strokeWidth={1.65} />
  {:else if id === 'tasks'}
    <CheckSquare size={16} strokeWidth={1.65} />
  {:else if id === 'plans'}
    <ClipboardList size={16} strokeWidth={1.65} />
  {:else if id === 'reviews'}
    <GitPullRequest size={16} strokeWidth={1.65} />
  {:else}
    <Workflow size={16} strokeWidth={1.65} />
  {/if}
{/snippet}

<nav
  aria-label="Difflab applications"
  data-testid="app-rail"
  class={cn(
    'flex w-12 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-2 select-none',
    className,
  )}
>
  {#each items as item (item.id)}
    {@const active = activeApp === item.id}
    <button
      type="button"
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      title={item.badge ? `${item.label} (${item.badge})` : item.label}
      data-testid={`app-rail-${item.id}`}
      class={appRailButtonVariants({ active })}
      onclick={() => onselect(item.id)}
    >
      {#if active}
        <span
          aria-hidden="true"
          class="absolute top-1.5 -left-1.5 h-6 w-0.5 rounded-r-full bg-foreground"
        ></span>
      {/if}
      {@render appIcon(item.id)}
      {#if item.live}
        <span
          aria-hidden="true"
          class="absolute top-1.5 right-1.5 size-1.5 animate-pulse rounded-full bg-[var(--info)]"
        ></span>
      {:else if item.badge && item.badge > 0}
        <span
          class="pointer-events-none absolute -top-0.5 -right-0.5 inline-flex min-w-3.5 items-center justify-center rounded-full bg-secondary px-1 text-[9px] leading-3.5 font-semibold text-muted-foreground ring-1 ring-sidebar"
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      {/if}
    </button>
  {/each}
</nav>
