<script lang="ts">
  import { BookOpen, CheckSquare, ClipboardList, GitBranch, GitPullRequest } from 'lucide-svelte'
  import { MarkdownDocument, StatusPill } from 'ui'
  import type { ProjectWorkspaceData, WorkspacePlanItem } from '$lib/server/workspace-data.js'

  // Types ---------------------------------------------------------------------
  interface Props {
    mode: 'plans' | 'reviews' | 'wikis' | 'tasks'
    project: ProjectWorkspaceData
    searchQuery: string
    selectedPlanId: string | null
    selectedReviewId: string | null
    onSelectPlan: (id: string) => void
    onSelectReview: (id: string) => void
  }

  // API -----------------------------------------------------------------------
  let {
    mode,
    project,
    searchQuery,
    selectedPlanId,
    selectedReviewId,
    onSelectPlan,
    onSelectReview,
  }: Props = $props()

  const q = $derived(searchQuery.trim().toLowerCase())

  const filteredPlans = $derived(
    q
      ? project.plans.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.repoShortName.toLowerCase().includes(q) ||
            p.markdown.toLowerCase().includes(q),
        )
      : project.plans,
  )

  const filteredReviews = $derived(
    q
      ? project.reviews.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.repoShortName.toLowerCase().includes(q) ||
            r.markdown.toLowerCase().includes(q),
        )
      : project.reviews,
  )

  const activePlan = $derived(
    filteredPlans.find((p) => p.id === selectedPlanId) ?? filteredPlans[0] ?? null,
  )
  const activeReview = $derived(
    filteredReviews.find((r) => r.id === selectedReviewId) ?? filteredReviews[0] ?? null,
  )

  // Helpers -------------------------------------------------------------------
  function groupPlans(items: WorkspacePlanItem[]): {
    active: WorkspacePlanItem[]
    completed: WorkspacePlanItem[]
  } {
    const completedSet = new Set(['completed', 'done'])
    return {
      active: items.filter((i) => !completedSet.has(i.status.toLowerCase())),
      completed: items.filter((i) => completedSet.has(i.status.toLowerCase())),
    }
  }
</script>

{#if mode === 'wikis'}
  <main data-testid="wikis-view" class="flex flex-1 items-center justify-center bg-background p-6">
    <div class="flex max-w-sm flex-col items-center gap-2 text-center">
      <div class="rounded-lg border border-border bg-card p-3 text-muted-foreground">
        <BookOpen size={20} strokeWidth={1.5} />
      </div>
      <h1 class="m-0 text-sm font-semibold text-foreground">No wikis yet</h1>
      <p class="m-0 text-xs text-muted-foreground">
        Wikis for {project.name} are not connected yet.
      </p>
    </div>
  </main>
{:else if mode === 'tasks'}
  <main data-testid="tasks-view" class="flex flex-1 items-center justify-center bg-background p-6">
    <div class="flex max-w-sm flex-col items-center gap-2 text-center">
      <div class="rounded-lg border border-border bg-card p-3 text-muted-foreground">
        <CheckSquare size={20} strokeWidth={1.5} />
      </div>
      <h1 class="m-0 text-sm font-semibold text-foreground">No tasks yet</h1>
      <p class="m-0 text-xs text-muted-foreground">
        External tracker tasks for {project.name} are not connected yet.
      </p>
    </div>
  </main>
{:else}
  <!-- Contextual Sidebar + Artifact Reader for Plans and Reviews -->
  <div class="flex min-h-0 flex-1 overflow-hidden">
    <aside
      data-testid={`${mode}-sidebar`}
      class="flex w-68 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <div
        class="border-b border-sidebar-border px-3 py-2 text-xs font-semibold text-foreground capitalize"
      >
        {project.name}
        {mode}
      </div>
      <div class="flex-1 overflow-y-auto px-2.5 py-3">
        {#if mode === 'plans'}
          {@const grouped = groupPlans(filteredPlans)}
          <section class="mb-4">
            <h2
              class="mb-1.5 px-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Active ({grouped.active.length})
            </h2>
            {#each grouped.active as item (item.id)}
              <button
                type="button"
                class={[
                  'mb-1 flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                  activePlan?.id === item.id
                    ? 'bg-sidebar-accent text-foreground'
                    : 'hover:bg-sidebar-accent/60',
                ].join(' ')}
                onclick={() => onSelectPlan(item.id)}
              >
                <div class="flex items-start justify-between gap-2">
                  <span class="line-clamp-2 font-medium text-foreground">{item.title}</span>
                  <StatusPill status={item.status} size="xs" />
                </div>
                <span class="truncate font-mono text-[10px] text-muted-foreground"
                  >{item.repoShortName}</span
                >
              </button>
            {/each}
            {#if grouped.active.length === 0}
              <p class="m-0 px-1.5 py-1 text-xs text-muted-foreground">No active plans.</p>
            {/if}
          </section>

          <section>
            <h2
              class="mb-1.5 px-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Completed ({grouped.completed.length})
            </h2>
            {#each grouped.completed as item (item.id)}
              <button
                type="button"
                class={[
                  'mb-1 flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                  activePlan?.id === item.id
                    ? 'bg-sidebar-accent text-foreground'
                    : 'hover:bg-sidebar-accent/60',
                ].join(' ')}
                onclick={() => onSelectPlan(item.id)}
              >
                <div class="flex items-start justify-between gap-2">
                  <span class="line-clamp-2 font-medium text-foreground">{item.title}</span>
                  <StatusPill status={item.status} size="xs" />
                </div>
                <span class="truncate font-mono text-[10px] text-muted-foreground"
                  >{item.repoShortName}</span
                >
              </button>
            {/each}
          </section>
        {:else if filteredReviews.length === 0}
          <p class="m-0 px-1.5 py-1 text-xs text-muted-foreground">No reviews recorded yet.</p>
        {:else}
          {#each filteredReviews as item (item.id)}
            <button
              type="button"
              class={[
                'mb-1 flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                activeReview?.id === item.id
                  ? 'bg-sidebar-accent text-foreground'
                  : 'hover:bg-sidebar-accent/60',
              ].join(' ')}
              onclick={() => onSelectReview(item.id)}
            >
              <div class="flex items-start justify-between gap-2">
                <span class="line-clamp-2 font-medium text-foreground">{item.title}</span>
                <StatusPill status={item.status} size="xs" />
              </div>
              <span class="truncate font-mono text-[10px] text-muted-foreground"
                >{item.repoShortName}</span
              >
            </button>
          {/each}
        {/if}
      </div>
    </aside>

    <main class="flex-1 overflow-y-auto bg-background px-6 py-5">
      {#if mode === 'plans'}
        {#if !activePlan}
          <p class="text-xs text-muted-foreground">
            No PLAN.md artifacts found for {project.name}.
          </p>
        {:else}
          <div class="mx-auto flex max-w-4xl flex-col gap-4">
            <header class="rounded-lg border border-border bg-card p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <ClipboardList size={15} strokeWidth={1.6} class="text-muted-foreground" />
                  <h1 class="m-0 text-base font-semibold text-foreground">{activePlan.title}</h1>
                </div>
                <StatusPill status={activePlan.status} size="sm" />
              </div>
              <div class="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span class="rounded bg-secondary px-2 py-0.5 font-mono"
                  >{activePlan.repoShortName}</span
                >
                {#if activePlan.branch}
                  <span
                    class="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-mono"
                  >
                    <GitBranch size={11} strokeWidth={1.6} />
                    {activePlan.branch}
                  </span>
                {/if}
                {#if activePlan.revisionCount > 0}
                  <span class="rounded bg-secondary px-2 py-0.5 font-mono">
                    {activePlan.revisionCount}
                    {activePlan.revisionCount === 1 ? 'revision' : 'revisions'}
                  </span>
                {/if}
              </div>
            </header>
            <article class="rounded-lg border border-border bg-card p-6">
              <MarkdownDocument markdown={activePlan.markdown} stripTitle />
            </article>
          </div>
        {/if}
      {:else if !activeReview}
        <p class="text-xs text-muted-foreground">
          No REVIEW.md artifacts found for {project.name}.
        </p>
      {:else}
        <div class="mx-auto flex max-w-4xl flex-col gap-4">
          <header class="rounded-lg border border-border bg-card p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <GitPullRequest size={15} strokeWidth={1.6} class="text-muted-foreground" />
                <h1 class="m-0 text-base font-semibold text-foreground">{activeReview.title}</h1>
              </div>
              <StatusPill status={activeReview.status} size="sm" />
            </div>
            <div class="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span class="rounded bg-secondary px-2 py-0.5 font-mono"
                >{activeReview.repoShortName}</span
              >
              {#if activeReview.mode}
                <span class="rounded bg-secondary px-2 py-0.5 font-mono"
                  >mode: {activeReview.mode}</span
                >
              {/if}
              {#if activeReview.hasRubric}
                <StatusPill status="rubric.yaml" tone="info" size="xs" />
              {/if}
              {#if activeReview.revision}
                <span class="truncate rounded bg-secondary px-2 py-0.5 font-mono text-[11px]">
                  {activeReview.revision}
                </span>
              {/if}
            </div>
          </header>
          <article class="rounded-lg border border-border bg-card p-6">
            <MarkdownDocument markdown={activeReview.markdown} stripTitle />
          </article>
        </div>
      {/if}
    </main>
  </div>
{/if}
