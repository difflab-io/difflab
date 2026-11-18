<script lang="ts">
  import {
    Select,
    SelectContent,
    SelectIndicator,
    SelectItem,
    SelectItemText,
    SelectTrigger,
    SelectValue,
  } from '@cloudvoyant/helical-svelte'
  import { cn, type SelectItemData } from '@cloudvoyant/helical-ui'
  import { Box, ChevronDown } from 'lucide-svelte'
  import { projectKeyPillVariants } from './styles.js'
  import type { ProjectSelectorProps } from './types.js'

  // API -----------------------------------------------------------------------
  let { projects, selectedId, onchange, class: className = '' }: ProjectSelectorProps = $props()

  const activeProject = $derived(projects.find((p) => p.id === selectedId) ?? projects[0] ?? null)

  const selectItems = $derived<SelectItemData[]>(
    projects.map((p) => ({
      value: p.id,
      label: `${p.id} — ${p.name}`,
    })),
  )

  const projectById = $derived(new Map(projects.map((p) => [p.id, p])))
</script>

<div class={cn('flex min-w-0 items-center', className)} data-testid="project-selector">
  {#if projects.length > 0}
    <Select
      items={selectItems}
      value={activeProject ? [activeProject.id] : []}
      size="sm"
      class="w-auto min-w-0"
      onValueChange={({ value }) => {
        if (value[0]) onchange(value[0])
      }}
    >
      <SelectTrigger
        aria-label="Project selector"
        data-testid="project-selector-trigger"
        title={activeProject
          ? `Project: ${activeProject.name} (${activeProject.id})`
          : 'Select project'}
        size="sm"
        class="h-7 w-auto max-w-64 min-w-0 gap-1.5 rounded-md border border-border/80 bg-card px-2 py-0 text-xs font-medium shadow-none hover:bg-accent hover:text-accent-foreground [&_svg]:size-3.5"
      >
        <Box size={13} strokeWidth={1.6} class="shrink-0 text-muted-foreground" />
        {#if activeProject}
          <span class={projectKeyPillVariants()}>{activeProject.id}</span>
          <span class="truncate text-xs font-medium text-foreground">{activeProject.name}</span>
        {:else}
          <SelectValue class="truncate" placeholder="Select project" />
        {/if}
        <SelectIndicator><ChevronDown size={12} strokeWidth={1.6} /></SelectIndicator>
      </SelectTrigger>
      <SelectContent class="w-max max-w-80 min-w-56 p-1">
        {#each selectItems as item (item.value)}
          {@const meta = projectById.get(item.value)}
          <SelectItem
            {item}
            class="min-h-7 gap-2 rounded-sm px-2 py-1 pe-2.5 text-xs leading-tight [&_svg]:size-3.5"
          >
            <Box size={13} strokeWidth={1.5} class="shrink-0 text-muted-foreground" />
            <SelectItemText class="flex flex-1 items-center justify-between gap-2 truncate">
              <span class="flex min-w-0 items-center gap-1.5 truncate">
                <span class={projectKeyPillVariants()}>{meta?.id ?? item.value}</span>
                <span class="truncate font-medium">{meta?.name ?? item.label}</span>
              </span>
              {#if meta}
                <span class="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {meta.repoCount}
                  {meta.repoCount === 1 ? 'repo' : 'repos'}
                </span>
              {/if}
            </SelectItemText>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  {:else}
    <span class="text-xs text-muted-foreground">No initialized projects</span>
  {/if}
</div>
