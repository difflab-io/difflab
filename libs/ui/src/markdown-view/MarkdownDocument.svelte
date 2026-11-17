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
    'difflab-markdown [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:bg-secondary/60 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:accent-[var(--success)]',
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
