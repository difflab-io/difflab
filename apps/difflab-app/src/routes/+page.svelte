<script lang="ts">
  import { onMount } from 'svelte'
  import type { FlowRun, FlowRunDetail, FlowStep, WorkerMessage } from 'difflab-db'
  import { ChevronRight, Search } from 'lucide-svelte'
  import {
    AppRail,
    ProjectSelector,
    ThemeService,
    ThemeToggle,
    type AppRailItem,
    type DifflabAppId,
    type ProjectSelectorOption,
  } from 'ui'
  import ArtifactExplorerView from '$lib/components/ArtifactExplorerView.svelte'
  import FlowsAppView from '$lib/components/FlowsAppView.svelte'
  import ProjectHomeView from '$lib/components/ProjectHomeView.svelte'
  import type { PageData } from './$types'

  // Constants -----------------------------------------------------------------
  const APP_LABELS: Record<DifflabAppId, string> = {
    home: 'Home',
    wikis: 'Wikis',
    tasks: 'Tasks',
    plans: 'Plans',
    reviews: 'Reviews',
    flows: 'Flows',
  }

  const theme = new ThemeService({
    storageKey: 'difflab.theme',
    themeClass: 'theme-difflab',
    defaultPreference: 'dark',
  })

  // API -----------------------------------------------------------------------
  let { data }: { data: PageData } = $props()

  let activeApp = $state<DifflabAppId>('home')
  let selectedProjectId = $state<string | null>(null)
  let showAllProjectsInFlows = $state(false)
  let searchQuery = $state('')

  let runs = $state<FlowRun[]>([])
  let selectedRunId = $state<string | null>(null)
  let selectedPlanId = $state<string | null>(null)
  let selectedReviewId = $state<string | null>(null)

  let stepsByRun = $state<Record<string, FlowStep[]>>({})
  let messagesByRun = $state<Record<string, WorkerMessage[]>>({})
  let streamConnected = $state(false)
  let initializedFromServer = $state(false)

  $effect(() => {
    runs = data.runs
    if (!initializedFromServer) {
      activeApp = data.initialApp
      selectedProjectId = data.initialProjectId
      initializedFromServer = true
    }
    if (data.initialDetail) {
      const id = data.initialDetail.run.id
      if (!selectedRunId) selectedRunId = id
      stepsByRun[id] = data.initialDetail.steps
      messagesByRun[id] = data.initialDetail.messages
    } else if (!selectedRunId && data.runs[0]) {
      selectedRunId = data.runs[0].id
    }
  })

  const activeProject = $derived(
    data.workspace.projects.find((p) => p.id === selectedProjectId) ??
      data.workspace.projects[0] ??
      null,
  )

  const projectOptions = $derived<ProjectSelectorOption[]>(
    data.workspace.projects.map((p) => ({
      id: p.id,
      name: p.name,
      repoCount: p.counts.repositories,
      flowCount: p.counts.flows,
    })),
  )

  const projectScopedRuns = $derived(
    activeProject
      ? runs.filter((r) => data.workspace.repoProjectMap[r.repoId] === activeProject.id)
      : runs,
  )

  const flowsSidebarRuns = $derived(showAllProjectsInFlows ? runs : projectScopedRuns)

  const activeStatuses = new Set(['queued', 'running', 'blocked'])
  const activeFlowCount = $derived(
    projectScopedRuns.filter((r) => activeStatuses.has(r.status)).length,
  )

  const selectedRun = $derived(runs.find((r) => r.id === selectedRunId) ?? null)
  const selectedSteps = $derived(selectedRunId ? (stepsByRun[selectedRunId] ?? []) : [])
  const selectedMessages = $derived(selectedRunId ? (messagesByRun[selectedRunId] ?? []) : [])

  const railItems = $derived<AppRailItem[]>([
    { id: 'home', label: 'Home' },
    { id: 'plans', label: 'Plans' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'flows', label: 'Flows', live: activeFlowCount > 0 },
  ])

  const breadcrumbLeaf = $derived.by(() => {
    if (activeApp === 'flows' && selectedRun) return selectedRun.flowName
    if (activeApp === 'plans' && activeProject) {
      const plan =
        activeProject.plans.find((p) => p.id === selectedPlanId) ?? activeProject.plans[0]
      return plan?.title ?? null
    }
    if (activeApp === 'reviews' && activeProject) {
      const rev =
        activeProject.reviews.find((r) => r.id === selectedReviewId) ?? activeProject.reviews[0]
      return rev?.title ?? null
    }
    return null
  })

  // Helpers -------------------------------------------------------------------
  function syncUrlState(
    nextProjectId: string | null,
    nextApp: DifflabAppId,
    nextRunId?: string | null,
  ): void {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (nextProjectId) url.searchParams.set('project', nextProjectId)
    url.searchParams.set('app', nextApp)
    if (nextApp === 'flows' && nextRunId) {
      url.searchParams.set('runId', nextRunId)
    } else {
      url.searchParams.delete('runId')
    }
    window.history.replaceState({}, '', url)
  }

  function handleSelectProject(projectId: string): void {
    selectedProjectId = projectId
    selectedPlanId = null
    selectedReviewId = null

    const nextRuns = runs.filter((r) => data.workspace.repoProjectMap[r.repoId] === projectId)
    if (!showAllProjectsInFlows) {
      const nextRunId = nextRuns[0]?.id ?? null
      selectedRunId = nextRunId
      if (nextRunId && !stepsByRun[nextRunId]) {
        void hydrateRunDetail(nextRunId)
      }
    }
    syncUrlState(projectId, activeApp, selectedRunId)
  }

  function handleSelectApp(app: DifflabAppId): void {
    activeApp = app
    if (app === 'flows' && !selectedRunId) {
      const candidate = flowsSidebarRuns[0]?.id ?? runs[0]?.id ?? null
      if (candidate) void selectRun(candidate)
    }
    syncUrlState(selectedProjectId, app, selectedRunId)
  }

  async function hydrateRunDetail(runId: string): Promise<void> {
    try {
      const response = await fetch(`/v1/runs/${encodeURIComponent(runId)}`)
      if (!response.ok) return
      const detail = (await response.json()) as FlowRunDetail
      upsertRun(detail.run)
      stepsByRun[runId] = detail.steps
      messagesByRun[runId] = detail.messages
    } catch {
      // Ignore transient network errors while streaming.
    }
  }

  function upsertRun(updated: FlowRun): void {
    const idx = runs.findIndex((r) => r.id === updated.id)
    if (idx === -1) {
      runs = [updated, ...runs]
    } else {
      runs = runs.map((r, i) => (i === idx ? updated : r))
    }
    if (!selectedRunId) {
      selectedRunId = updated.id
    }
  }

  function upsertStep(runId: string, updated: FlowStep): void {
    const existing = stepsByRun[runId] ?? []
    const idx = existing.findIndex((s) => s.stepId === updated.stepId)
    if (idx === -1) {
      stepsByRun[runId] = [...existing, updated].sort((a, b) => a.seq - b.seq)
    } else {
      stepsByRun[runId] = existing.map((s, i) => (i === idx ? updated : s))
    }
  }

  function appendMessage(runId: string, msg: WorkerMessage): void {
    const existing = messagesByRun[runId] ?? []
    if (existing.some((m) => m.id === msg.id)) return
    messagesByRun[runId] = [...existing, msg]
  }

  async function selectRun(runId: string): Promise<void> {
    selectedRunId = runId
    activeApp = 'flows'
    syncUrlState(selectedProjectId, 'flows', runId)
    if (!stepsByRun[runId]) {
      await hydrateRunDetail(runId)
    }
  }

  onMount(() => {
    const disposeTheme = theme.init()
    const es = new EventSource('/v1/stream')
    es.onopen = () => {
      streamConnected = true
    }
    es.onerror = () => {
      streamConnected = false
    }

    es.addEventListener('run.updated', (raw) => {
      const payload = JSON.parse((raw as MessageEvent<string>).data) as {
        runId: string
        run: FlowRun
      }
      const isNew = !runs.some((r) => r.id === payload.runId)
      upsertRun(payload.run)
      if (isNew) {
        const runProj = data.workspace.repoProjectMap[payload.run.repoId]
        if (runProj) selectedProjectId = runProj
        selectedRunId = payload.runId
        activeApp = 'flows'
        syncUrlState(selectedProjectId, 'flows', payload.runId)
      }
      if (isNew || !stepsByRun[payload.runId]) {
        void hydrateRunDetail(payload.runId)
      }
    })

    es.addEventListener('step.updated', (raw) => {
      const payload = JSON.parse((raw as MessageEvent<string>).data) as {
        runId: string
        step: FlowStep
      }
      upsertStep(payload.runId, payload.step)
    })

    es.addEventListener('worker.message', (raw) => {
      const payload = JSON.parse((raw as MessageEvent<string>).data) as {
        runId: string
        message: WorkerMessage
      }
      appendMessage(payload.runId, payload.message)
    })

    return () => {
      es.close()
      disposeTheme()
    }
  })
</script>

<svelte:head>
  <title>
    {activeProject ? `${activeProject.name} · ${APP_LABELS[activeApp]} — Difflab` : 'Difflab'}
  </title>
</svelte:head>

<div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
  <!-- Top Toolbar (PRD: Project Selector, Breadcrumbs, Search, Live Status, Theme) -->
  <header
    class="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-sidebar px-3 text-sidebar-foreground select-none"
  >
    <div class="flex min-w-0 items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-xs font-semibold tracking-tight text-foreground hover:bg-accent"
        onclick={() => handleSelectApp('home')}
      >
        <span class="inline-block size-2 rounded-xs bg-foreground"></span>
        <span>difflab</span>
      </button>

      <span class="text-muted-foreground/50">/</span>

      <ProjectSelector
        projects={projectOptions}
        selectedId={activeProject?.id ?? null}
        onchange={handleSelectProject}
      />

      <nav aria-label="Breadcrumb" class="hidden min-w-0 items-center gap-1 text-xs md:flex">
        <ChevronRight size={13} strokeWidth={1.6} class="shrink-0 text-muted-foreground/60" />
        <button
          type="button"
          class={[
            'rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-accent',
            breadcrumbLeaf ? 'text-muted-foreground' : 'text-foreground',
          ].join(' ')}
          onclick={() => handleSelectApp(activeApp)}
        >
          {APP_LABELS[activeApp]}
        </button>
        {#if breadcrumbLeaf}
          <ChevronRight size={13} strokeWidth={1.6} class="shrink-0 text-muted-foreground/60" />
          <span class="max-w-60 truncate font-medium text-foreground">{breadcrumbLeaf}</span>
        {/if}
      </nav>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      {#if activeApp === 'flows' || activeApp === 'plans' || activeApp === 'reviews'}
        <label class="relative hidden items-center sm:flex">
          <Search
            size={12}
            strokeWidth={1.6}
            class="pointer-events-none absolute left-2 text-muted-foreground"
          />
          <input
            type="search"
            bind:value={searchQuery}
            placeholder={`Filter ${APP_LABELS[activeApp].toLowerCase()}...`}
            aria-label={`Filter ${APP_LABELS[activeApp]}`}
            class="h-7 w-44 rounded-md border border-border bg-background pr-2.5 pl-6.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
        </label>
      {/if}

      <div
        data-testid="sse-status"
        data-connected={streamConnected}
        class="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11px] font-medium text-muted-foreground"
      >
        <span
          class={[
            'size-1.5 rounded-full',
            streamConnected ? 'bg-[var(--success)]' : 'bg-muted-foreground',
          ].join(' ')}
        ></span>
        <span>{streamConnected ? 'SSE live' : 'connecting'}</span>
      </div>

      <ThemeToggle
        value={theme.preference}
        size="sm"
        onchange={(next) => theme.setPreference(next)}
      />
    </div>
  </header>

  <!-- Main Workspace Shell: Icon-Only App Bar + Contextual Sidebar (where applicable) + Content -->
  <div class="flex min-h-0 flex-1 overflow-hidden">
    <AppRail {activeApp} items={railItems} onselect={handleSelectApp} />

    {#if activeApp === 'flows'}
      <FlowsAppView
        projectId={activeProject?.id ?? null}
        projectName={activeProject?.name ?? null}
        runs={flowsSidebarRuns}
        allRunsCount={runs.length}
        showAllProjects={showAllProjectsInFlows}
        {searchQuery}
        {selectedRun}
        {selectedSteps}
        {selectedMessages}
        repoLabels={data.repoLabels}
        onToggleShowAll={(next) => {
          showAllProjectsInFlows = next
          const pool = next ? runs : projectScopedRuns
          if (!pool.some((r) => r.id === selectedRunId) && pool[0]) {
            void selectRun(pool[0].id)
          }
        }}
        onSelectRun={(runId) => {
          void selectRun(runId)
        }}
      />
    {:else if !activeProject}
      <main class="flex flex-1 items-center justify-center p-6 text-center">
        <div class="max-w-md">
          <h1 class="m-0 text-base font-semibold text-foreground">
            No Difflab projects initialized
          </h1>
          <p class="mt-1.5 text-xs text-muted-foreground">
            Run <code class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground"
              >difflab init</code
            > inside a repository to register your first project.
          </p>
        </div>
      </main>
    {:else if activeApp === 'home'}
      <ProjectHomeView
        project={activeProject}
        projectRuns={projectScopedRuns}
        onOpenApp={handleSelectApp}
      />
    {:else}
      <ArtifactExplorerView
        mode={activeApp}
        project={activeProject}
        {searchQuery}
        {selectedPlanId}
        {selectedReviewId}
        onSelectPlan={(id) => {
          selectedPlanId = id
        }}
        onSelectReview={(id) => {
          selectedReviewId = id
        }}
      />
    {/if}
  </div>
</div>
