<script lang="ts">
  import { CodeBlock, Mermaid, Prose } from '@cloudvoyant/helical-svelte'
  import { cn } from '@cloudvoyant/helical-ui'
  import { segmentMarkdown } from './parser.js'
  import type { MarkdownDocumentProps } from './types.js'

  // API -----------------------------------------------------------------------
  let {
    markdown,
    stripTitle = true,
    size = 'sm',
    class: className = '',
  }: MarkdownDocumentProps = $props()

  const segments = $derived(segmentMarkdown(markdown, { stripTitle }))
</script>

<Prose
  {size}
  data-slot="markdown-document"
  class={cn(
    'difflab-markdown [&_.difflab-table-scroll]:my-4 [&_.difflab-table-scroll]:w-full [&_.difflab-table-scroll]:overflow-x-auto [&_.difflab-table-scroll]:rounded-md [&_.difflab-table-scroll]:border [&_.difflab-table-scroll]:border-border [&_table]:my-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_thead]:bg-secondary/60 [&_th]:border-r [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:align-top [&_th]:font-semibold [&_th]:whitespace-nowrap [&_th:last-child]:border-r-0 [&_th:not([align])]:text-left [&_td]:border-r [&_td]:border-b [&_td]:border-border/70 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td:last-child]:border-r-0 [&_td:not([align])]:text-left [&_tbody_tr:last-child_td]:border-b-0 [&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:accent-[var(--success)]',
    className,
  )}
>
  {#each segments as seg, idx (idx)}
    {#if seg.kind === 'mermaid'}
      <Mermaid
        code={seg.code}
        class="not-prose my-4 overflow-x-auto rounded-lg border border-border bg-background/70 p-4"
      />
    {:else if seg.kind === 'code'}
      <CodeBlock code={seg.code} language={seg.language} scrollable maxHeight={420} class="my-4" />
    {:else}
      {@html seg.html}
    {/if}
  {/each}
</Prose>
