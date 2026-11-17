<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { ArrowRight, ExternalLink, FolderGit2, Layers, Package } from 'lucide-svelte'
  import StatusPill from '../status-pill/StatusPill.svelte'
  import { componentChipVariants, repoGraphRowVariants, repoNodeBoxVariants } from './styles.js'
  import type { RepoComponentGraphProps } from './types.js'

  // API -----------------------------------------------------------------------
  let { repositories, onOpenDocs, class: className = '' }: RepoComponentGraphProps = $props()
</script>

<div
  data-testid="repo-component-graph"
  class={cn('overflow-hidden rounded-lg border border-border bg-card', className)}
>
  <div
    class="hidden grid-cols-[minmax(190px,240px)_28px_1fr] items-center gap-2.5 border-b border-border bg-secondary/45 px-3.5 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid"
  >
    <span>Repositories ({repositories.length})</span>
    <span></span>
    <span>Apps &amp; libraries</span>
  </div>

  {#if repositories.length === 0}
    <div class="px-4 py-6 text-center text-xs text-muted-foreground">
      No repositories are linked to this project yet. Run <code class="font-mono">difflab init</code
      > inside a repository to link it.
    </div>
  {:else}
    {#each repositories as repo (repo.id)}
      <div class={repoGraphRowVariants()} data-testid={`repo-graph-row-${repo.shortName}`}>
        <div class={repoNodeBoxVariants()}>
          <div class="flex items-center justify-between gap-2">
            <span
              class="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs font-semibold text-foreground"
            >
              <FolderGit2 size={13} strokeWidth={1.6} class="shrink-0 text-muted-foreground" />
              <span class="truncate">{repo.shortName}</span>
            </span>
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer"
              title={`Open ${repo.url}`}
              class="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink size={11} strokeWidth={1.6} />
            </a>
          </div>
          <div class="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span class="truncate font-mono">
              {repo.localPath ? 'local linked' : 'remote'}
            </span>
            {#if repo.docCount > 0 && onOpenDocs}
              <button
                type="button"
                class="shrink-0 font-medium text-[var(--info)] hover:underline"
                onclick={() => onOpenDocs(repo.id)}
              >
                {repo.docCount}
                {repo.docCount === 1 ? 'doc' : 'docs'} ↗
              </button>
            {/if}
          </div>
        </div>

        <div class="hidden h-full items-center justify-center text-muted-foreground/70 md:flex">
          <ArrowRight size={14} strokeWidth={1.5} />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          {#if repo.components.length === 0}
            <span class="py-1 text-xs text-muted-foreground">
              Single-package repository ({repo.shortName})
            </span>
          {:else}
            {#each repo.components as comp (`${repo.id}:${comp.path}:${comp.name}`)}
              <div class={componentChipVariants()}>
                {#if comp.kind === 'App'}
                  <Layers size={12} strokeWidth={1.6} class="shrink-0 text-[var(--info)]" />
                {:else}
                  <Package size={12} strokeWidth={1.6} class="shrink-0 text-[var(--chart-4)]" />
                {/if}
                <span class="font-medium text-foreground">{comp.name}</span>
                <StatusPill status={comp.kind} size="xs" />
                {#if comp.path && comp.path !== '.'}
                  <span class="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                    {comp.path}
                  </span>
                {/if}
                {#if (comp.hasDocs || repo.docCount > 0) && onOpenDocs}
                  <button
                    type="button"
                    class="ml-0.5 text-[11px] font-medium text-[var(--info)] hover:underline"
                    onclick={() => onOpenDocs(repo.id, comp.name)}
                  >
                    Docs ↗
                  </button>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>
