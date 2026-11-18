<script lang="ts">
  import { Button, Card, CardBody } from '@cloudvoyant/helical-svelte'
  import type { FlowRun } from 'difflab-db'
  import { ArrowUpRight, BookOpen, CheckSquare, Workflow } from 'lucide-svelte'
  import { RepositoryTable, type DifflabAppId } from 'ui'
  import type { ProjectWorkspaceData } from '$lib/server/workspace-data.js'

  // Types ---------------------------------------------------------------------
  interface Props {
    project: ProjectWorkspaceData
    projectRuns: FlowRun[]
    onOpenApp: (app: DifflabAppId) => void
  }

  // API -----------------------------------------------------------------------
  let { project, projectRuns, onOpenApp }: Props = $props()
</script>

<main
  data-testid="project-home"
  class="flex-1 overflow-y-auto bg-background px-6 py-6 text-foreground"
>
  <div class="mx-auto flex max-w-6xl flex-col gap-6">
    <!-- Project Header -->
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

    <!-- Linked Repositories -->
    <section class="flex flex-col gap-2.5">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Repositories
        </h2>
        <span class="text-xs text-muted-foreground">
          Linked repositories in {project.name}
        </span>
      </div>
      <RepositoryTable repositories={project.repositories} />
    </section>
  </div>
</main>
