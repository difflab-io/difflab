<script lang="ts">
  import { cn } from '@cloudvoyant/helical-ui'
  import { ExternalLink, FolderGit2 } from 'lucide-svelte'
  import { repositoryTableCellVariants, repositoryTableRowVariants } from './styles.js'
  import type { RepositoryTableProps } from './types.js'

  // API -----------------------------------------------------------------------
  let { repositories, class: className = '' }: RepositoryTableProps = $props()

  // Helpers -------------------------------------------------------------------
  function formatRemoteUrl(url: string): string {
    return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  }
</script>

<div
  data-testid="repositories-list"
  class={cn('overflow-hidden rounded-lg border border-border bg-card', className)}
>
  {#if repositories.length === 0}
    <div class="px-4 py-6 text-center text-xs text-muted-foreground">
      No repositories are linked to this project yet. Run <code class="font-mono">difflab init</code
      > inside a repository to link it.
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table
        data-testid="repositories-table"
        class="w-full min-w-[36rem] table-fixed border-collapse text-xs"
      >
        <colgroup>
          <col class="w-64" />
          <col class="w-auto" />
          <col class="w-68" />
        </colgroup>
        <thead class="border-b border-border bg-secondary/45">
          <tr>
            <th
              scope="col"
              class="px-3.5 py-2 text-left text-[10px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase"
            >
              Repository ({repositories.length})
            </th>
            <th
              scope="col"
              class="px-3.5 py-2 text-left text-[10px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase"
            >
              Local status
            </th>
            <th
              scope="col"
              class="px-3.5 py-2 text-left text-[10px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase"
            >
              Remote
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/60">
          {#each repositories as repo (repo.id)}
            <tr class={repositoryTableRowVariants()} data-testid={`repo-row-${repo.shortName}`}>
              <td class={repositoryTableCellVariants()}>
                <span
                  title={repo.shortName}
                  class="inline-flex max-w-full items-center gap-2 truncate font-mono text-xs font-semibold text-foreground"
                >
                  <FolderGit2 size={13} strokeWidth={1.6} class="shrink-0 text-muted-foreground" />
                  <span class="truncate">{repo.shortName}</span>
                </span>
              </td>
              <td class={repositoryTableCellVariants()}>
                {#if repo.localPath}
                  <span
                    title={repo.localPath}
                    class="block truncate font-mono text-[11px] text-muted-foreground"
                  >
                    {repo.localPath}
                  </span>
                {:else}
                  <span class="block font-mono text-[11px] text-muted-foreground/60">
                    Remote only
                  </span>
                {/if}
              </td>
              <td class={repositoryTableCellVariants()}>
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open ${repo.url}`}
                  class="inline-flex max-w-full items-center gap-1.5 truncate font-mono text-[11px] text-[var(--info)] transition-colors hover:underline"
                >
                  <span class="truncate">{formatRemoteUrl(repo.url)}</span>
                  <ExternalLink size={11} strokeWidth={1.6} class="shrink-0" />
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
