<script lang="ts">
  import type { FlowRun } from 'difflab-db'
  import { ExternalLink, FileCode2, GitBranch, GitPullRequest, Workflow } from 'lucide-svelte'
  import { StatusPill } from 'ui'
  import type {
    ProjectWorkspaceData,
    WorkspaceDocItem,
    WorkspacePlanItem,
    WorkspaceReviewItem,
  } from '$lib/server/workspace-data.js'

  // Types ---------------------------------------------------------------------
  interface Props {
    mode: 'plans' | 'reviews' | 'wikis' | 'tasks'
    project: ProjectWorkspaceData
    projectRuns: FlowRun[]
    searchQuery: string
    selectedPlanId: string | null
    selectedReviewId: string | null
    selectedDocId: string | null
    onSelectPlan: (id: string) => void
    onSelectReview: (id: string) => void
    onSelectDoc: (id: string) => void
    onOpenFlow: (runId: string) => void
  }

  // API -----------------------------------------------------------------------
  let {
    mode,
    project,
    projectRuns,
    searchQuery,
    selectedPlanId,
    selectedReviewId,
    selectedDocId,
    onSelectPlan,
    onSelectReview,
    onSelectDoc,
    onOpenFlow,
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

  const filteredDocs = $derived(
    q
      ? project.docs.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.relativePath.toLowerCase().includes(q) ||
            d.repoShortName.toLowerCase().includes(q),
        )
      : project.docs,
  )

  const activePlan = $derived(
    filteredPlans.find((p) => p.id === selectedPlanId) ?? filteredPlans[0] ?? null,
  )
  const activeReview = $derived(
    filteredReviews.find((r) => r.id === selectedReviewId) ?? filteredReviews[0] ?? null,
  )
  const activeDoc = $derived(
    filteredDocs.find((d) => d.id === selectedDocId) ?? filteredDocs[0] ?? null,
  )

  const triggeredRuns = $derived(projectRuns.filter((r) => Boolean(r.triggerKey)))
  const issueLinkedPlans = $derived(project.plans.filter((p) => Boolean(p.issue)))

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

  function groupDocsByCategory(items: WorkspaceDocItem[]): [string, WorkspaceDocItem[]][] {
    const map = new Map<string, WorkspaceDocItem[]>()
    for (const doc of items) {
      const list = map.get(doc.category) ?? []
      list.push(doc)
      map.set(doc.category, list)
    }
    return [...map.entries()]
  }
</script>

{#if mode === 'tasks'}
  <!-- Full-width Tasks View (PRD: Home and Tasks omit contextual sidebar) -->
  <main data-testid="tasks-view" class="flex-1 overflow-y-auto bg-background px-6 py-6">
    <div class="mx-auto flex max-w-5xl flex-col gap-6">
      <section
        class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"
      >
        <div>
          <h1 class="m-0 text-xl font-semibold tracking-tight text-foreground">
            Tasks &amp; Issue Triggers
          </h1>
          <p class="mt-1 mb-0 text-xs text-muted-foreground">
            Difflab references external issue trackers such as Linear and dispatches automated
            workflows when matching tasks enter Ready or Todo.
          </p>
        </div>
        <a
          href="https://linear.app"
          target="_blank"
          rel="noreferrer"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <span>Open Linear</span>
          <ExternalLink size={12} strokeWidth={1.6} />
        </a>
      </section>

      <!-- Configured difflab.yaml Linear Triggers -->
      <section class="flex flex-col gap-2.5">
        <h2 class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Configured Linear Ready Triggers ({project.triggers.length})
        </h2>
        {#if project.triggers.length === 0}
          <div
            class="rounded-lg border border-border bg-card px-4 py-5 text-xs text-muted-foreground"
          >
            No <code class="font-mono">flows.triggers</code> entries found in
            <code class="font-mono">difflab.yaml</code>
            for {project.name} repositories yet.
          </div>
        {:else}
          <div
            class="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border/70"
          >
            {#each project.triggers as trig, idx (`${trig.repoId}:${trig.flowName}:${idx}`)}
              <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono font-semibold text-foreground">{trig.repoShortName}</span>
                  <span class="text-muted-foreground">→</span>
                  <StatusPill status={trig.flowName} tone="info" size="xs" />
                  <span
                    class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    harness: {trig.defaultHarness}
                  </span>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                  {#if trig.team}
                    <span
                      class="rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px]"
                    >
                      team: {trig.team}
                    </span>
                  {/if}
                  {#each trig.labels as label (label)}
                    <span
                      class="rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-[var(--info)]"
                    >
                      {label}
                    </span>
                  {/each}
                  {#if trig.assignee}
                    <span
                      class="rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px]"
                    >
                      assignee: {trig.assignee}
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Issue-Triggered Flow Runs & Issue-Linked Plans -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section class="flex flex-col gap-2">
          <h2 class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Issue-triggered runs ({triggeredRuns.length})
          </h2>
          <div
            class="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border/70"
          >
            {#if triggeredRuns.length === 0}
              <p class="m-0 px-4 py-5 text-xs text-muted-foreground">
                No automated issue-triggered runs recorded for {project.name} yet.
              </p>
            {:else}
              {#each triggeredRuns as run (run.id)}
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-accent/50"
                  onclick={() => onOpenFlow(run.id)}
                >
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <span class="truncate font-semibold text-foreground">{run.flowName}</span>
                    <span class="truncate font-mono text-[11px] text-muted-foreground">
                      {run.triggerKey}
                    </span>
                  </div>
                  <StatusPill status={run.status} size="xs" />
                </button>
              {/each}
            {/if}
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Plans linked to issues ({issueLinkedPlans.length})
          </h2>
          <div
            class="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border/70"
          >
            {#if issueLinkedPlans.length === 0}
              <p class="m-0 px-4 py-5 text-xs text-muted-foreground">
                No PLAN.md files in {project.name} currently specify an external issue URL or key.
              </p>
            {:else}
              {#each issueLinkedPlans as plan (plan.id)}
                <div class="flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs">
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <span class="truncate font-medium text-foreground">{plan.title}</span>
                    <span class="truncate font-mono text-[11px] text-[var(--info)]"
                      >{plan.issue}</span
                    >
                  </div>
                  <StatusPill status={plan.status} size="xs" />
                </div>
              {/each}
            {/if}
          </div>
        </section>
      </div>
    </div>
  </main>
{:else}
  <!-- Contextual Sidebar + Artifact Reader for Plans, Reviews, and Wikis -->
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
        {:else if mode === 'reviews'}
          {#if filteredReviews.length === 0}
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
        {:else}
          {@const categories = groupDocsByCategory(filteredDocs)}
          {#if categories.length === 0}
            <p class="m-0 px-1.5 py-1 text-xs text-muted-foreground">
              No Markdown docs discovered.
            </p>
          {:else}
            {#each categories as [category, items] (category)}
              <section class="mb-4">
                <h2
                  class="mb-1.5 px-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {category} ({items.length})
                </h2>
                {#each items as doc (doc.id)}
                  <button
                    type="button"
                    class={[
                      'mb-1 flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                      activeDoc?.id === doc.id
                        ? 'bg-sidebar-accent text-foreground'
                        : 'hover:bg-sidebar-accent/60',
                    ].join(' ')}
                    onclick={() => onSelectDoc(doc.id)}
                  >
                    <span class="truncate font-medium text-foreground">{doc.title}</span>
                    <span class="truncate font-mono text-[10px] text-muted-foreground">
                      {doc.repoShortName} · {doc.relativePath}
                    </span>
                  </button>
                {/each}
              </section>
            {/each}
          {/if}
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
                  <FileCode2 size={15} strokeWidth={1.6} class="text-muted-foreground" />
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
            <article class="rounded-lg border border-border bg-card p-5">
              <pre
                class="m-0 overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">{activePlan.markdown}</pre>
            </article>
          </div>
        {/if}
      {:else if mode === 'reviews'}
        {#if !activeReview}
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
            <article class="rounded-lg border border-border bg-card p-5">
              <pre
                class="m-0 overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">{activeReview.markdown}</pre>
            </article>
          </div>
        {/if}
      {:else if !activeDoc}
        <p class="text-xs text-muted-foreground">
          No Markdown documentation discovered for {project.name}.
        </p>
      {:else}
        <div class="mx-auto flex max-w-4xl flex-col gap-4">
          <header class="rounded-lg border border-border bg-card p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h1 class="m-0 text-base font-semibold text-foreground">{activeDoc.title}</h1>
              <StatusPill status={activeDoc.category} tone="info" size="xs" />
            </div>
            <div
              class="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground"
            >
              <span>{activeDoc.repoShortName}</span>
              <span>·</span>
              <span>{activeDoc.relativePath}</span>
            </div>
          </header>
          <article class="rounded-lg border border-border bg-card p-5">
            <pre
              class="m-0 overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">{activeDoc.markdown}</pre>
          </article>
        </div>
      {/if}
    </main>
  </div>
{/if}
