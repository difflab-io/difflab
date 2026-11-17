<script lang="ts">
  import { Button, Card, CardBody } from '@cloudvoyant/helical-svelte'
  import type { FlowRun } from 'difflab-db'
  import {
    ArrowUpRight,
    BookOpen,
    CheckSquare,
    FileCode2,
    GitPullRequest,
    Layers,
    Package,
    Workflow,
  } from 'lucide-svelte'
  import { RepoComponentGraph, StatusPill, type DifflabAppId } from 'ui'
  import type { ProjectWorkspaceData } from '$lib/server/workspace-data.js'

  // Types ---------------------------------------------------------------------
  interface Props {
    project: ProjectWorkspaceData
    projectRuns: FlowRun[]
    repoLabels: Record<string, string>
    onOpenApp: (app: DifflabAppId) => void
    onOpenFlow: (runId: string) => void
    onOpenPlan: (planId: string) => void
    onOpenReview: (reviewId: string) => void
  }

  // API -----------------------------------------------------------------------
  let { project, projectRuns, repoLabels, onOpenApp, onOpenFlow, onOpenPlan, onOpenReview }: Props =
    $props()

  const recentPlans = $derived(project.plans.slice(0, 4))
  const recentReviews = $derived(project.reviews.slice(0, 4))
  const recentFlows = $derived(projectRuns.slice(0, 5))

  // Helpers -------------------------------------------------------------------
  function shortRelativeDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
</script>

<main
  data-testid="project-home"
  class="flex-1 overflow-y-auto bg-background px-6 py-6 text-foreground"
>
  <div class="mx-auto flex max-w-6xl flex-col gap-6">
    <!-- Project Header & Taxonomy Summary -->
    <section class="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center rounded bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground"
          >
            {project.id}
          </span>
          <span class="text-xs text-muted-foreground">Project workspace</span>
        </div>
        <h1
          class="m-0 text-xl font-semibold tracking-tight text-foreground"
          data-testid="project-home-title"
        >
          {project.name}
        </h1>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5"
          >
            <span class="font-semibold text-foreground">{project.counts.repositories}</span>
            {project.counts.repositories === 1 ? 'Repository' : 'Repositories'}
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5"
          >
            <Layers size={12} strokeWidth={1.6} class="text-[var(--info)]" />
            <span class="font-semibold text-foreground">{project.counts.apps}</span>
            {project.counts.apps === 1 ? 'App' : 'Apps'}
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5"
          >
            <Package size={12} strokeWidth={1.6} class="text-[var(--chart-4)]" />
            <span class="font-semibold text-foreground">{project.counts.libraries}</span>
            {project.counts.libraries === 1 ? 'Library' : 'Libraries'}
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5"
          >
            <span class="font-semibold text-foreground">{project.counts.plans}</span>
            {project.counts.plans === 1 ? 'Plan' : 'Plans'}
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5"
          >
            <span class="font-semibold text-foreground">{project.counts.reviews}</span>
            {project.counts.reviews === 1 ? 'Review' : 'Reviews'}
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5"
          >
            <span class="font-semibold text-foreground">{projectRuns.length}</span>
            {projectRuns.length === 1 ? 'Flow run' : 'Flow runs'}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="h-7 gap-1.5 px-2.5 text-xs"
          onclick={() => onOpenApp('flows')}
        >
          <Workflow size={13} strokeWidth={1.6} />
          <span>Open Flows ({projectRuns.length})</span>
        </Button>
      </div>
    </section>

    <!-- Explore This Project -->
    <section class="flex flex-col gap-2.5">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Explore this project
        </h2>
        <span class="text-xs text-muted-foreground">Project wikis and external task views</span>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card class="border-border bg-card transition-colors hover:border-foreground/30">
          <CardBody class="p-0">
            <button
              type="button"
              class="flex w-full items-start justify-between gap-3 p-3.5 text-left"
              onclick={() => onOpenApp('wikis')}
            >
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 rounded-md border border-border bg-secondary p-2 text-foreground"
                >
                  <BookOpen size={15} strokeWidth={1.6} />
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-sm font-semibold text-foreground">Wikis</span>
                  <span class="text-xs text-muted-foreground">
                    No wikis connected to {project.name} yet
                  </span>
                </div>
              </div>
              <ArrowUpRight size={14} strokeWidth={1.6} class="shrink-0 text-muted-foreground" />
            </button>
          </CardBody>
        </Card>

        <Card class="border-border bg-card transition-colors hover:border-foreground/30">
          <CardBody class="p-0">
            <button
              type="button"
              class="flex w-full items-start justify-between gap-3 p-3.5 text-left"
              onclick={() => onOpenApp('tasks')}
            >
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 rounded-md border border-border bg-secondary p-2 text-foreground"
                >
                  <CheckSquare size={15} strokeWidth={1.6} />
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="text-sm font-semibold text-foreground">Tasks</span>
                  <span class="text-xs text-muted-foreground">
                    No external task views connected to {project.name} yet
                  </span>
                </div>
              </div>
              <ArrowUpRight size={14} strokeWidth={1.6} class="shrink-0 text-muted-foreground" />
            </button>
          </CardBody>
        </Card>
      </div>
    </section>

    <!-- Components & Repositories Graph -->
    <section class="flex flex-col gap-2.5">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Components &amp; repositories
        </h2>
        <span class="text-xs text-muted-foreground">
          Repository boundaries mapped to discovered Apps and Libraries
        </span>
      </div>
      <RepoComponentGraph repositories={project.repositories} />
    </section>

    <!-- Continue Work: Plans, Reviews, Flows -->
    <section class="flex flex-col gap-2.5">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Continue work
        </h2>
        <span class="text-xs text-muted-foreground">
          Recent deliverables and automated workflow runs in {project.name}
        </span>
      </div>

      <div class="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <!-- Plans Column -->
        <div class="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div
            class="flex items-center justify-between border-b border-border bg-secondary/40 px-3.5 py-2"
          >
            <span class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <FileCode2 size={13} strokeWidth={1.6} class="text-muted-foreground" />
              Plans ({project.plans.length})
            </span>
            <button
              type="button"
              class="text-[11px] font-medium text-[var(--info)] hover:underline"
              onclick={() => onOpenApp('plans')}
            >
              View all →
            </button>
          </div>
          <div class="flex flex-col divide-y divide-border/70">
            {#if recentPlans.length === 0}
              <p class="m-0 px-3.5 py-5 text-xs text-muted-foreground">
                No durable PLAN.md artifacts recorded for this project yet.
              </p>
            {:else}
              {#each recentPlans as plan (plan.id)}
                <button
                  type="button"
                  class="flex flex-col gap-1 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50"
                  onclick={() => onOpenPlan(plan.id)}
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="line-clamp-1 text-xs font-medium text-foreground"
                      >{plan.title}</span
                    >
                    <StatusPill status={plan.status} size="xs" />
                  </div>
                  <div
                    class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                  >
                    <span class="truncate font-mono">{plan.repoShortName}</span>
                    <span class="shrink-0">
                      {plan.revisionCount > 0
                        ? `${plan.revisionCount} rev · `
                        : ''}{shortRelativeDate(plan.updatedAt)}
                    </span>
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Reviews Column -->
        <div class="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div
            class="flex items-center justify-between border-b border-border bg-secondary/40 px-3.5 py-2"
          >
            <span class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <GitPullRequest size={13} strokeWidth={1.6} class="text-muted-foreground" />
              Reviews ({project.reviews.length})
            </span>
            <button
              type="button"
              class="text-[11px] font-medium text-[var(--info)] hover:underline"
              onclick={() => onOpenApp('reviews')}
            >
              View all →
            </button>
          </div>
          <div class="flex flex-col divide-y divide-border/70">
            {#if recentReviews.length === 0}
              <p class="m-0 px-3.5 py-5 text-xs text-muted-foreground">
                No REVIEW.md artifacts recorded for this project yet.
              </p>
            {:else}
              {#each recentReviews as rev (rev.id)}
                <button
                  type="button"
                  class="flex flex-col gap-1 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50"
                  onclick={() => onOpenReview(rev.id)}
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="line-clamp-1 text-xs font-medium text-foreground">{rev.title}</span
                    >
                    <StatusPill status={rev.status} size="xs" />
                  </div>
                  <div
                    class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                  >
                    <span class="truncate font-mono">{rev.repoShortName}</span>
                    <span class="shrink-0">
                      {rev.hasRubric ? 'rubric · ' : ''}{shortRelativeDate(rev.updatedAt)}
                    </span>
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Flows Column -->
        <div class="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div
            class="flex items-center justify-between border-b border-border bg-secondary/40 px-3.5 py-2"
          >
            <span class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Workflow size={13} strokeWidth={1.6} class="text-muted-foreground" />
              Flows ({projectRuns.length})
            </span>
            <button
              type="button"
              class="text-[11px] font-medium text-[var(--info)] hover:underline"
              onclick={() => onOpenApp('flows')}
            >
              View all →
            </button>
          </div>
          <div class="flex flex-col divide-y divide-border/70">
            {#if recentFlows.length === 0}
              <p class="m-0 px-3.5 py-5 text-xs text-muted-foreground">
                No workflow runs recorded for this project yet.
              </p>
            {:else}
              {#each recentFlows as run (run.id)}
                <button
                  type="button"
                  class="flex flex-col gap-1 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/50"
                  onclick={() => onOpenFlow(run.id)}
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="truncate text-xs font-semibold text-foreground"
                      >{run.flowName}</span
                    >
                    <StatusPill status={run.status} size="xs" />
                  </div>
                  <div
                    class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                  >
                    <span class="truncate font-mono">
                      {repoLabels[run.repoId]?.split(' / ')[1] ?? run.id}
                    </span>
                    <span class="shrink-0 font-mono text-[10px]">
                      {shortRelativeDate(run.updatedAt)}
                    </span>
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>
      </div>
    </section>
  </div>
</main>
